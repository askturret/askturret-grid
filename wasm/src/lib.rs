#![deny(unsafe_code)]

use wasm_bindgen::prelude::*;
use js_sys::{Array, Object, Reflect, Uint32Array};
use std::collections::HashMap;

// ============================================================================
// Initialization
// ============================================================================

#[wasm_bindgen(start)]
pub fn init() {
    #[cfg(feature = "console_error_panic_hook")]
    console_error_panic_hook::set_once();
}

// ============================================================================
// Column Data Types
// ============================================================================

#[derive(Clone)]
enum ColumnData {
    Strings(Vec<String>),
    Numbers(Vec<f64>),  // NaN represents null
}

impl ColumnData {
    fn len(&self) -> usize {
        match self {
            ColumnData::Strings(v) => v.len(),
            ColumnData::Numbers(v) => v.len(),
        }
    }

    fn push_null(&mut self) {
        match self {
            ColumnData::Strings(v) => v.push(String::new()),
            ColumnData::Numbers(v) => v.push(f64::NAN),
        }
    }

    fn get_string(&self, idx: usize) -> Option<&str> {
        match self {
            ColumnData::Strings(v) => v.get(idx).map(|s| s.as_str()),
            ColumnData::Numbers(v) => None,
        }
    }

    fn get_number(&self, idx: usize) -> Option<f64> {
        match self {
            ColumnData::Numbers(v) => v.get(idx).copied().filter(|n| !n.is_nan()),
            ColumnData::Strings(_) => None,
        }
    }

    fn set_string(&mut self, idx: usize, val: &str) {
        if let ColumnData::Strings(v) = self {
            if idx < v.len() {
                v[idx] = val.to_string();
            }
        }
    }

    fn set_number(&mut self, idx: usize, val: f64) {
        if let ColumnData::Numbers(v) = self {
            if idx < v.len() {
                v[idx] = val;
            }
        }
    }

    fn to_js_value(&self, idx: usize) -> JsValue {
        match self {
            ColumnData::Strings(v) => {
                v.get(idx).map(|s| JsValue::from_str(s)).unwrap_or(JsValue::NULL)
            }
            ColumnData::Numbers(v) => {
                v.get(idx)
                    .filter(|n| !n.is_nan())
                    .map(|&n| JsValue::from_f64(n))
                    .unwrap_or(JsValue::NULL)
            }
        }
    }
}

#[derive(Clone)]
struct Column {
    name: String,
    data: ColumnData,
    indexed: bool,  // Include in trigram search
}

// ============================================================================
// Incremental Trigram Index
// ============================================================================

struct TrigramIndex {
    // trigram (3 Unicode code points) -> sorted vec of row indices
    // Sorted vecs are more memory-efficient and faster to intersect than HashSet
    index: HashMap<String, Vec<u32>>,
}

impl TrigramIndex {
    fn new() -> Self {
        Self {
            index: HashMap::new(),
        }
    }

    fn generate_trigrams(text: &str) -> Vec<String> {
        let lower = text.to_lowercase();
        let chars: Vec<char> = lower.chars().collect();
        if chars.len() < 3 {
            return vec![];
        }
        (0..chars.len() - 2)
            .map(|i| {
                let mut s = String::with_capacity(12); // Max 3 chars * 4 bytes each
                s.push(chars[i]);
                s.push(chars[i + 1]);
                s.push(chars[i + 2]);
                s
            })
            .collect()
    }

    /// Add a row to the index - O(text_length * log(posting_list_size))
    fn add(&mut self, row: u32, text: &str) {
        for trigram in Self::generate_trigrams(text) {
            let posting_list = self.index.entry(trigram).or_default();
            // Insert in sorted order using binary search
            match posting_list.binary_search(&row) {
                Ok(_) => {} // Already present, skip
                Err(pos) => posting_list.insert(pos, row),
            }
        }
    }

    /// Remove a row from the index - O(text_length * log(posting_list_size))
    fn remove(&mut self, row: u32, text: &str) {
        for trigram in Self::generate_trigrams(text) {
            if let Some(posting_list) = self.index.get_mut(&trigram) {
                if let Ok(pos) = posting_list.binary_search(&row) {
                    posting_list.remove(pos);
                }
                // Don't remove empty vecs - they might be reused
            }
        }
    }

    /// Update a row in the index - O(old_len + new_len)
    fn update(&mut self, row: u32, old_text: &str, new_text: &str) {
        // Only update if text actually changed
        if old_text != new_text {
            self.remove(row, old_text);
            self.add(row, new_text);
        }
    }

    /// Search for rows matching query - O(total_posting_list_sizes)
    /// Uses merge-based intersection on sorted posting lists
    fn search(&self, query: &str) -> Vec<u32> {
        let trigrams = Self::generate_trigrams(query);

        if trigrams.is_empty() {
            // Query too short for trigrams - caller should do full scan
            return vec![];
        }

        // Start with the first trigram's posting list
        let mut result = match self.index.get(&trigrams[0]) {
            Some(list) => list.clone(),
            None => return vec![], // First trigram not found - no matches
        };

        // Intersect with remaining trigrams using merge-based algorithm
        for trigram in &trigrams[1..] {
            match self.index.get(trigram) {
                Some(posting_list) => {
                    result = Self::intersect_sorted(&result, posting_list);
                    if result.is_empty() {
                        return vec![]; // Early exit if intersection becomes empty
                    }
                }
                None => {
                    // Trigram not in index - no matches
                    return vec![];
                }
            }
        }

        result
    }

    /// Merge-based intersection of two sorted vectors - O(n + m)
    fn intersect_sorted(a: &[u32], b: &[u32]) -> Vec<u32> {
        let mut result = Vec::new();
        let mut i = 0;
        let mut j = 0;

        while i < a.len() && j < b.len() {
            match a[i].cmp(&b[j]) {
                std::cmp::Ordering::Equal => {
                    result.push(a[i]);
                    i += 1;
                    j += 1;
                }
                std::cmp::Ordering::Less => i += 1,
                std::cmp::Ordering::Greater => j += 1,
            }
        }

        result
    }

    fn clear(&mut self) {
        self.index.clear();
    }
}

// ============================================================================
// Sort Direction
// ============================================================================

#[wasm_bindgen]
#[derive(Clone, Copy, PartialEq)]
pub enum SortDir {
    Asc = 0,
    Desc = 1,
    None = 2,
}

// ============================================================================
// View State
// ============================================================================

struct ViewState {
    filter_text: String,
    sort_column: Option<usize>,
    sort_dir: SortDir,

    // Cached view (invalidated on changes)
    cached_view: Option<Vec<u32>>,
}

impl ViewState {
    fn new() -> Self {
        Self {
            filter_text: String::new(),
            sort_column: None,
            sort_dir: SortDir::None,
            cached_view: None,
        }
    }

    fn invalidate(&mut self) {
        self.cached_view = None;
    }
}

// ============================================================================
// GridStore - Main API
// ============================================================================

#[wasm_bindgen]
pub struct GridStore {
    columns: Vec<Column>,
    column_index: HashMap<String, usize>,
    row_count: usize,
    id_column: usize,
    id_to_row: HashMap<String, u32>,
    deleted: Vec<bool>,  // Soft-delete flags
    trigram_index: TrigramIndex,
    indexed_columns: Vec<usize>,
    view: ViewState,
}

#[wasm_bindgen]
impl GridStore {
    /// Create a new GridStore with the given schema
    /// Schema format: [{ name: "id", type: "string", primaryKey: true, indexed: true }, ...]
    #[wasm_bindgen(constructor)]
    pub fn new(schema: &JsValue) -> Result<GridStore, JsError> {
        let schema_arr = Array::from(schema);
        let mut columns = Vec::new();
        let mut column_index = HashMap::new();
        let mut id_column = 0;
        let mut indexed_columns = Vec::new();

        for i in 0..schema_arr.length() {
            let col_def = schema_arr.get(i);

            let name = Reflect::get(&col_def, &JsValue::from_str("name"))
                .map_err(|_| JsError::new("Column must have 'name'"))?
                .as_string()
                .ok_or_else(|| JsError::new("Column name must be string"))?;

            let col_type = Reflect::get(&col_def, &JsValue::from_str("type"))
                .map_err(|_| JsError::new("Column must have 'type'"))?
                .as_string()
                .ok_or_else(|| JsError::new("Column type must be string"))?;

            let is_primary = Reflect::get(&col_def, &JsValue::from_str("primaryKey"))
                .map(|v| v.is_truthy())
                .unwrap_or(false);

            let is_indexed = Reflect::get(&col_def, &JsValue::from_str("indexed"))
                .map(|v| v.is_truthy())
                .unwrap_or(false);

            let data = match col_type.as_str() {
                "string" => ColumnData::Strings(Vec::new()),
                "number" | "integer" => ColumnData::Numbers(Vec::new()),
                _ => return Err(JsError::new(&format!("Unknown column type: {}", col_type))),
            };

            if is_primary {
                id_column = i as usize;
            }

            if is_indexed {
                indexed_columns.push(i as usize);
            }

            column_index.insert(name.clone(), i as usize);
            columns.push(Column {
                name,
                data,
                indexed: is_indexed,
            });
        }

        Ok(GridStore {
            columns,
            column_index,
            row_count: 0,
            id_column,
            id_to_row: HashMap::new(),
            deleted: Vec::new(),
            trigram_index: TrigramIndex::new(),
            indexed_columns,
            view: ViewState::new(),
        })
    }

    /// Load rows from JSON array - O(n * cols)
    /// Returns number of rows loaded
    #[wasm_bindgen(js_name = loadRows)]
    pub fn load_rows(&mut self, rows: &JsValue) -> Result<u32, JsError> {
        let rows_arr = Array::from(rows);
        let count = rows_arr.length();

        // Pre-allocate
        for col in &mut self.columns {
            match &mut col.data {
                ColumnData::Strings(v) => v.reserve(count as usize),
                ColumnData::Numbers(v) => v.reserve(count as usize),
            }
        }
        self.deleted.reserve(count as usize);

        for i in 0..count {
            let row = rows_arr.get(i);
            self.insert_row_internal(&row)?;
        }

        self.view.invalidate();
        Ok(count)
    }

    /// Insert a single row - O(cols + indexed_text_len)
    pub fn insert(&mut self, row: &JsValue) -> Result<u32, JsError> {
        let row_idx = self.insert_row_internal(row)?;
        self.view.invalidate();
        Ok(row_idx)
    }

    /// Update a row by ID - O(cols + indexed_text_len)
    pub fn update(&mut self, id: &str, changes: &JsValue) -> Result<(), JsError> {
        let row_idx = *self.id_to_row.get(id)
            .ok_or_else(|| JsError::new(&format!("Row not found: {}", id)))?;

        // Get old indexed text for trigram update
        let old_indexed_text = self.get_indexed_text(row_idx as usize);

        // Apply changes
        let changes_obj = Object::from(changes.clone());
        let keys = Object::keys(&changes_obj);

        for i in 0..keys.length() {
            let key = keys.get(i).as_string().unwrap();
            if let Some(&col_idx) = self.column_index.get(&key) {
                let value = Reflect::get(changes, &JsValue::from_str(&key)).unwrap();
                self.set_cell_value(row_idx as usize, col_idx, &value);
            }
        }

        // Update trigram index incrementally
        let new_indexed_text = self.get_indexed_text(row_idx as usize);
        self.trigram_index.update(row_idx, &old_indexed_text, &new_indexed_text);

        self.view.invalidate();
        Ok(())
    }

    /// Batch update multiple rows - O(updates * (cols + indexed_text_len))
    /// Updates format: [{ id: "row1", field1: value1, ... }, ...]
    #[wasm_bindgen(js_name = batchUpdate)]
    pub fn batch_update(&mut self, updates: &JsValue) -> Result<u32, JsError> {
        let updates_arr = Array::from(updates);
        let mut count = 0u32;

        for i in 0..updates_arr.length() {
            let update = updates_arr.get(i);

            // Get ID
            let id = Reflect::get(&update, &JsValue::from_str("id"))
                .ok()
                .and_then(|v| v.as_string());

            if let Some(id) = id {
                if let Some(&row_idx) = self.id_to_row.get(&id) {
                    // Get old indexed text
                    let old_indexed_text = self.get_indexed_text(row_idx as usize);

                    // Apply all fields except 'id'
                    let obj = Object::from(update.clone());
                    let keys = Object::keys(&obj);

                    for j in 0..keys.length() {
                        let key = keys.get(j).as_string().unwrap();
                        if key != "id" {
                            if let Some(&col_idx) = self.column_index.get(&key) {
                                let value = Reflect::get(&update, &JsValue::from_str(&key)).unwrap();
                                self.set_cell_value(row_idx as usize, col_idx, &value);
                            }
                        }
                    }

                    // Update trigram index
                    let new_indexed_text = self.get_indexed_text(row_idx as usize);
                    self.trigram_index.update(row_idx, &old_indexed_text, &new_indexed_text);

                    count += 1;
                }
            }
        }

        if count > 0 {
            self.view.invalidate();
        }

        Ok(count)
    }

    /// Delete a row by ID (soft delete) - O(1)
    pub fn delete(&mut self, id: &str) -> Result<(), JsError> {
        let row_idx = *self.id_to_row.get(id)
            .ok_or_else(|| JsError::new(&format!("Row not found: {}", id)))?;

        // Remove from trigram index
        let indexed_text = self.get_indexed_text(row_idx as usize);
        self.trigram_index.remove(row_idx, &indexed_text);

        // Soft delete
        self.deleted[row_idx as usize] = true;

        self.view.invalidate();
        Ok(())
    }

    /// Set filter text - triggers view recomputation
    #[wasm_bindgen(js_name = setFilter)]
    pub fn set_filter(&mut self, search: &str) {
        if self.view.filter_text != search {
            self.view.filter_text = search.to_lowercase();
            self.view.invalidate();
        }
    }

    /// Set sort column and direction
    #[wasm_bindgen(js_name = setSort)]
    pub fn set_sort(&mut self, column: &str, direction: SortDir) {
        let col_idx = self.column_index.get(column).copied();

        let changed = self.view.sort_column != col_idx || self.view.sort_dir != direction;

        if changed {
            self.view.sort_column = col_idx;
            self.view.sort_dir = direction;
            self.view.invalidate();
        }
    }

    /// Clear filter
    #[wasm_bindgen(js_name = clearFilter)]
    pub fn clear_filter(&mut self) {
        if !self.view.filter_text.is_empty() {
            self.view.filter_text.clear();
            self.view.invalidate();
        }
    }

    /// Clear sort
    #[wasm_bindgen(js_name = clearSort)]
    pub fn clear_sort(&mut self) {
        if self.view.sort_column.is_some() {
            self.view.sort_column = None;
            self.view.sort_dir = SortDir::None;
            self.view.invalidate();
        }
    }

    /// Get number of rows in current view (after filter)
    #[wasm_bindgen(js_name = viewCount)]
    pub fn view_count(&mut self) -> usize {
        self.ensure_view();
        self.view.cached_view.as_ref().map(|v| v.len()).unwrap_or(0)
    }

    /// Get total row count (before filter)
    #[wasm_bindgen(js_name = rowCount)]
    pub fn row_count(&self) -> usize {
        self.row_count - self.deleted.iter().filter(|&&d| d).count()
    }

    /// Get view indices for virtualized rendering
    #[wasm_bindgen(js_name = viewIndices)]
    pub fn view_indices(&mut self, start: usize, count: usize) -> Uint32Array {
        self.ensure_view();

        let view = self.view.cached_view.as_ref().unwrap();
        let end = (start + count).min(view.len());
        let slice = &view[start..end];

        let arr = Uint32Array::new_with_length(slice.len() as u32);
        for (i, &idx) in slice.iter().enumerate() {
            arr.set_index(i as u32, idx);
        }
        arr
    }

    /// Get rows by indices - returns JSON array
    #[wasm_bindgen(js_name = getRows)]
    pub fn get_rows(&self, indices: &Uint32Array) -> JsValue {
        let result = Array::new();

        for i in 0..indices.length() {
            let row_idx = indices.get_index(i) as usize;
            let row_obj = self.row_to_js(row_idx);
            result.push(&row_obj);
        }

        result.into()
    }

    /// Get visible rows for rendering (combines viewIndices + getRows)
    #[wasm_bindgen(js_name = getVisibleRows)]
    pub fn get_visible_rows(&mut self, start: usize, count: usize) -> JsValue {
        self.ensure_view();

        let view = self.view.cached_view.as_ref().unwrap();
        let end = (start + count).min(view.len());

        let result = Array::new();
        for &row_idx in &view[start..end] {
            let row_obj = self.row_to_js(row_idx as usize);
            result.push(&row_obj);
        }

        result.into()
    }

    /// Get a single cell value
    #[wasm_bindgen(js_name = getCell)]
    pub fn get_cell(&self, row: u32, column: &str) -> JsValue {
        if let Some(&col_idx) = self.column_index.get(column) {
            self.columns[col_idx].data.to_js_value(row as usize)
        } else {
            JsValue::UNDEFINED
        }
    }

    /// Get column names
    #[wasm_bindgen(js_name = columnNames)]
    pub fn column_names(&self) -> JsValue {
        let arr = Array::new();
        for col in &self.columns {
            arr.push(&JsValue::from_str(&col.name));
        }
        arr.into()
    }
}

// Private implementation
impl GridStore {
    fn insert_row_internal(&mut self, row: &JsValue) -> Result<u32, JsError> {
        let row_idx = self.row_count as u32;

        // Extract ID
        let id_col_name = &self.columns[self.id_column].name;
        let id = Reflect::get(row, &JsValue::from_str(id_col_name))
            .ok()
            .and_then(|v| v.as_string())
            .ok_or_else(|| JsError::new("Row must have ID field"))?;

        // Check for duplicate
        if self.id_to_row.contains_key(&id) {
            return Err(JsError::new(&format!("Duplicate ID: {}", id)));
        }

        // Insert values into columns
        for col in &mut self.columns {
            let value = Reflect::get(row, &JsValue::from_str(&col.name))
                .unwrap_or(JsValue::NULL);

            match &mut col.data {
                ColumnData::Strings(v) => {
                    v.push(value.as_string().unwrap_or_default());
                }
                ColumnData::Numbers(v) => {
                    v.push(value.as_f64().unwrap_or(f64::NAN));
                }
            }
        }

        // Add to ID index
        self.id_to_row.insert(id, row_idx);
        self.deleted.push(false);
        self.row_count += 1;

        // Add to trigram index
        let indexed_text = self.get_indexed_text(row_idx as usize);
        self.trigram_index.add(row_idx, &indexed_text);

        Ok(row_idx)
    }

    fn get_indexed_text(&self, row_idx: usize) -> String {
        let mut text = String::new();
        for &col_idx in &self.indexed_columns {
            if let Some(s) = self.columns[col_idx].data.get_string(row_idx) {
                if !text.is_empty() {
                    text.push(' ');
                }
                text.push_str(s);
            }
        }
        text
    }

    fn set_cell_value(&mut self, row_idx: usize, col_idx: usize, value: &JsValue) {
        let col = &mut self.columns[col_idx];
        match &mut col.data {
            ColumnData::Strings(v) => {
                if row_idx < v.len() {
                    v[row_idx] = value.as_string().unwrap_or_default();
                }
            }
            ColumnData::Numbers(v) => {
                if row_idx < v.len() {
                    v[row_idx] = value.as_f64().unwrap_or(f64::NAN);
                }
            }
        }
    }

    fn row_to_js(&self, row_idx: usize) -> JsValue {
        let obj = Object::new();
        for col in &self.columns {
            let value = col.data.to_js_value(row_idx);
            Reflect::set(&obj, &JsValue::from_str(&col.name), &value).unwrap();
        }
        obj.into()
    }

    fn ensure_view(&mut self) {
        if self.view.cached_view.is_some() {
            return;
        }

        let mut indices: Vec<u32> = if self.view.filter_text.is_empty() {
            // No filter - all non-deleted rows
            (0..self.row_count as u32)
                .filter(|&i| !self.deleted[i as usize])
                .collect()
        } else {
            // Use trigram index for candidates
            let candidates = self.trigram_index.search(&self.view.filter_text);

            if candidates.is_empty() && self.view.filter_text.chars().count() < 3 {
                // Query too short for trigrams (< 3 Unicode chars) - full scan
                (0..self.row_count as u32)
                    .filter(|&i| {
                        !self.deleted[i as usize] && self.row_matches_filter(i as usize)
                    })
                    .collect()
            } else {
                // Verify candidates actually match
                candidates
                    .into_iter()
                    .filter(|&i| {
                        !self.deleted[i as usize] && self.row_matches_filter(i as usize)
                    })
                    .collect()
            }
        };

        // Sort if needed
        if let (Some(col_idx), dir) = (self.view.sort_column, self.view.sort_dir) {
            if dir != SortDir::None {
                let col = &self.columns[col_idx];
                match &col.data {
                    ColumnData::Strings(v) => {
                        indices.sort_by(|&a, &b| {
                            let va = &v[a as usize];
                            let vb = &v[b as usize];
                            let cmp = va.cmp(vb);
                            if dir == SortDir::Desc { cmp.reverse() } else { cmp }
                        });
                    }
                    ColumnData::Numbers(v) => {
                        indices.sort_by(|&a, &b| {
                            let va = v[a as usize];
                            let vb = v[b as usize];
                            let cmp = va.partial_cmp(&vb).unwrap_or(std::cmp::Ordering::Equal);
                            if dir == SortDir::Desc { cmp.reverse() } else { cmp }
                        });
                    }
                }
            }
        }

        self.view.cached_view = Some(indices);
    }

    fn row_matches_filter(&self, row_idx: usize) -> bool {
        let filter = &self.view.filter_text;
        if filter.is_empty() {
            return true;
        }

        // Pre-process filter once per row (not per column)
        // ASCII filters use byte-level fast path (zero allocation)
        // Non-ASCII filters need char collection (done once here, not per column)
        let filter_chars_cache: Option<Vec<char>> = if !filter.is_ascii() {
            Some(filter.chars().collect())
        } else {
            None
        };

        // Check indexed columns
        for &col_idx in &self.indexed_columns {
            if let Some(text) = self.columns[col_idx].data.get_string(row_idx) {
                if Self::contains_case_insensitive(text, filter, filter_chars_cache.as_deref()) {
                    return true;
                }
            }
        }

        false
    }

    /// Case-insensitive substring search with minimal allocation
    /// filter MUST already be lowercased
    /// filter_chars_cache: Pre-collected filter chars for non-ASCII filters (avoids re-collecting per column)
    ///
    /// Uses ASCII fast path for common case (trading/finance data is typically ASCII-heavy),
    /// falls back to full Unicode char-by-char comparison only when needed.
    fn contains_case_insensitive(text: &str, filter: &str, filter_chars_cache: Option<&[char]>) -> bool {
        if filter.is_empty() {
            return true;
        }

        // Fast path: both strings are ASCII - use byte-level comparison (zero allocation)
        if text.is_ascii() && filter.is_ascii() {
            // ASCII lowercase comparison via bytes - zero allocation
            let text_bytes = text.as_bytes();
            let filter_bytes = filter.as_bytes();

            if text_bytes.len() < filter_bytes.len() {
                return false;
            }

            return text_bytes.windows(filter_bytes.len()).any(|window| {
                window.iter().zip(filter_bytes.iter()).all(|(t, f)| {
                    t.to_ascii_lowercase() == *f
                })
            });
        }

        // Slow path: non-ASCII text requires proper Unicode handling
        // Use pre-collected filter_chars from cache if available,
        // otherwise collect on-demand (happens when filter is ASCII but text is non-ASCII)
        let filter_chars_vec: Vec<char>;
        let filter_chars: &[char] = match filter_chars_cache {
            Some(cached) => cached,
            None => {
                // ASCII filter checking non-ASCII text - collect filter chars on demand
                filter_chars_vec = filter.chars().collect();
                &filter_chars_vec
            }
        };

        // Iterator-based approach to avoid allocating full text_chars vec
        // Collect lowercased chars only as we scan
        let mut text_iter = text.chars().flat_map(|c| c.to_lowercase()).peekable();

        // Try to match filter at each position
        loop {
            // Clone iterator to try matching from current position
            let mut candidate = text_iter.clone();
            let mut matched = true;

            for &filter_char in filter_chars {
                match candidate.next() {
                    Some(text_char) if text_char == filter_char => continue,
                    _ => {
                        matched = false;
                        break;
                    }
                }
            }

            if matched {
                return true;
            }

            // Advance to next position
            if text_iter.next().is_none() {
                break;
            }
        }

        false
    }
}

// ============================================================================
// Benchmarks
// ============================================================================

#[wasm_bindgen]
pub fn bench_store_load(count: u32) -> f64 {
    use js_sys::Date;

    // Create schema
    let schema = Array::new();
    let id_col = Object::new();
    Reflect::set(&id_col, &JsValue::from_str("name"), &JsValue::from_str("id")).unwrap();
    Reflect::set(&id_col, &JsValue::from_str("type"), &JsValue::from_str("string")).unwrap();
    Reflect::set(&id_col, &JsValue::from_str("primaryKey"), &JsValue::TRUE).unwrap();
    schema.push(&id_col);

    let symbol_col = Object::new();
    Reflect::set(&symbol_col, &JsValue::from_str("name"), &JsValue::from_str("symbol")).unwrap();
    Reflect::set(&symbol_col, &JsValue::from_str("type"), &JsValue::from_str("string")).unwrap();
    Reflect::set(&symbol_col, &JsValue::from_str("indexed"), &JsValue::TRUE).unwrap();
    schema.push(&symbol_col);

    let price_col = Object::new();
    Reflect::set(&price_col, &JsValue::from_str("name"), &JsValue::from_str("price")).unwrap();
    Reflect::set(&price_col, &JsValue::from_str("type"), &JsValue::from_str("number")).unwrap();
    schema.push(&price_col);

    // Create rows
    let rows = Array::new();
    for i in 0..count {
        let row = Object::new();
        Reflect::set(&row, &JsValue::from_str("id"), &JsValue::from_str(&format!("row_{}", i))).unwrap();
        Reflect::set(&row, &JsValue::from_str("symbol"), &JsValue::from_str(&format!("SYM_{}", i % 1000))).unwrap();
        Reflect::set(&row, &JsValue::from_str("price"), &JsValue::from_f64((i as f64) * 1.5)).unwrap();
        rows.push(&row);
    }

    let start = Date::now();
    let mut store = GridStore::new(&schema.into()).unwrap();
    store.load_rows(&rows.into()).unwrap();
    Date::now() - start
}

#[wasm_bindgen]
pub fn bench_store_filter(count: u32) -> f64 {
    use js_sys::Date;

    // Create and load store
    let schema = Array::new();
    let id_col = Object::new();
    Reflect::set(&id_col, &JsValue::from_str("name"), &JsValue::from_str("id")).unwrap();
    Reflect::set(&id_col, &JsValue::from_str("type"), &JsValue::from_str("string")).unwrap();
    Reflect::set(&id_col, &JsValue::from_str("primaryKey"), &JsValue::TRUE).unwrap();
    schema.push(&id_col);

    let symbol_col = Object::new();
    Reflect::set(&symbol_col, &JsValue::from_str("name"), &JsValue::from_str("symbol")).unwrap();
    Reflect::set(&symbol_col, &JsValue::from_str("type"), &JsValue::from_str("string")).unwrap();
    Reflect::set(&symbol_col, &JsValue::from_str("indexed"), &JsValue::TRUE).unwrap();
    schema.push(&symbol_col);

    let rows = Array::new();
    for i in 0..count {
        let row = Object::new();
        Reflect::set(&row, &JsValue::from_str("id"), &JsValue::from_str(&format!("row_{}", i))).unwrap();
        Reflect::set(&row, &JsValue::from_str("symbol"), &JsValue::from_str(&format!("SYM_{}", i % 1000))).unwrap();
        rows.push(&row);
    }

    let mut store = GridStore::new(&schema.into()).unwrap();
    store.load_rows(&rows.into()).unwrap();

    // Benchmark filter
    let start = Date::now();
    store.set_filter("SYM_42");
    let _count = store.view_count();
    Date::now() - start
}

#[wasm_bindgen]
pub fn bench_store_update(count: u32, update_count: u32) -> f64 {
    use js_sys::Date;

    // Create and load store
    let schema = Array::new();
    let id_col = Object::new();
    Reflect::set(&id_col, &JsValue::from_str("name"), &JsValue::from_str("id")).unwrap();
    Reflect::set(&id_col, &JsValue::from_str("type"), &JsValue::from_str("string")).unwrap();
    Reflect::set(&id_col, &JsValue::from_str("primaryKey"), &JsValue::TRUE).unwrap();
    schema.push(&id_col);

    let symbol_col = Object::new();
    Reflect::set(&symbol_col, &JsValue::from_str("name"), &JsValue::from_str("symbol")).unwrap();
    Reflect::set(&symbol_col, &JsValue::from_str("type"), &JsValue::from_str("string")).unwrap();
    Reflect::set(&symbol_col, &JsValue::from_str("indexed"), &JsValue::TRUE).unwrap();
    schema.push(&symbol_col);

    let price_col = Object::new();
    Reflect::set(&price_col, &JsValue::from_str("name"), &JsValue::from_str("price")).unwrap();
    Reflect::set(&price_col, &JsValue::from_str("type"), &JsValue::from_str("number")).unwrap();
    schema.push(&price_col);

    let rows = Array::new();
    for i in 0..count {
        let row = Object::new();
        Reflect::set(&row, &JsValue::from_str("id"), &JsValue::from_str(&format!("row_{}", i))).unwrap();
        Reflect::set(&row, &JsValue::from_str("symbol"), &JsValue::from_str(&format!("SYM_{}", i % 1000))).unwrap();
        Reflect::set(&row, &JsValue::from_str("price"), &JsValue::from_f64((i as f64) * 1.5)).unwrap();
        rows.push(&row);
    }

    let mut store = GridStore::new(&schema.into()).unwrap();
    store.load_rows(&rows.into()).unwrap();

    // Create batch update
    let updates = Array::new();
    for i in 0..update_count {
        let update = Object::new();
        Reflect::set(&update, &JsValue::from_str("id"), &JsValue::from_str(&format!("row_{}", i * 7 % count))).unwrap();
        Reflect::set(&update, &JsValue::from_str("price"), &JsValue::from_f64((i as f64) * 2.5)).unwrap();
        updates.push(&update);
    }

    // Benchmark batch update
    let start = Date::now();
    store.batch_update(&updates.into()).unwrap();
    Date::now() - start
}

/// Benchmark intersect-heavy filter - measures posting list intersection performance
/// This stresses the sorted-vec optimization (replacement for HashSet)
#[wasm_bindgen]
pub fn bench_intersect_heavy_filter(count: u32) -> f64 {
    use js_sys::Date;

    let schema = Array::new();
    let id_col = Object::new();
    Reflect::set(&id_col, &JsValue::from_str("name"), &JsValue::from_str("id")).unwrap();
    Reflect::set(&id_col, &JsValue::from_str("type"), &JsValue::from_str("string")).unwrap();
    Reflect::set(&id_col, &JsValue::from_str("primaryKey"), &JsValue::TRUE).unwrap();
    schema.push(&id_col);

    let text_col = Object::new();
    Reflect::set(&text_col, &JsValue::from_str("name"), &JsValue::from_str("text")).unwrap();
    Reflect::set(&text_col, &JsValue::from_str("type"), &JsValue::from_str("string")).unwrap();
    Reflect::set(&text_col, &JsValue::from_str("indexed"), &JsValue::TRUE).unwrap();
    schema.push(&text_col);

    let rows = Array::new();
    for i in 0..count {
        let row = Object::new();
        Reflect::set(&row, &JsValue::from_str("id"), &JsValue::from_str(&format!("row_{}", i))).unwrap();
        // Create text with many overlapping trigrams to stress intersection
        Reflect::set(&row, &JsValue::from_str("text"), &JsValue::from_str(&format!("performance optimization benchmark test data row_{}", i % 100))).unwrap();
        rows.push(&row);
    }

    let mut store = GridStore::new(&schema.into()).unwrap();
    store.load_rows(&rows.into()).unwrap();

    // Multi-trigram query that requires intersecting many posting lists
    let start = Date::now();
    store.set_filter("performance optimization");
    let _count = store.view_count();
    Date::now() - start
}

/// Benchmark row matching with lowercase allocation - measures case-insensitive contains performance
/// This stresses the lowercase allocation optimization
#[wasm_bindgen]
pub fn bench_row_matching(count: u32) -> f64 {
    use js_sys::Date;

    let schema = Array::new();
    let id_col = Object::new();
    Reflect::set(&id_col, &JsValue::from_str("name"), &JsValue::from_str("id")).unwrap();
    Reflect::set(&id_col, &JsValue::from_str("type"), &JsValue::from_str("string")).unwrap();
    Reflect::set(&id_col, &JsValue::from_str("primaryKey"), &JsValue::TRUE).unwrap();
    schema.push(&id_col);

    let desc_col = Object::new();
    Reflect::set(&desc_col, &JsValue::from_str("name"), &JsValue::from_str("description")).unwrap();
    Reflect::set(&desc_col, &JsValue::from_str("type"), &JsValue::from_str("string")).unwrap();
    Reflect::set(&desc_col, &JsValue::from_str("indexed"), &JsValue::TRUE).unwrap();
    schema.push(&desc_col);

    let rows = Array::new();
    for i in 0..count {
        let row = Object::new();
        Reflect::set(&row, &JsValue::from_str("id"), &JsValue::from_str(&format!("row_{}", i))).unwrap();
        // Long mixed-case text to stress lowercase comparison
        Reflect::set(&row, &JsValue::from_str("description"), &JsValue::from_str(&format!("The Quick BROWN Fox Jumps Over The LAZY Dog - Item Number {}", i))).unwrap();
        rows.push(&row);
    }

    let mut store = GridStore::new(&schema.into()).unwrap();
    store.load_rows(&rows.into()).unwrap();

    // Query that will match many rows and trigger row_matches_filter many times
    let start = Date::now();
    store.set_filter("quick");
    let _count = store.view_count();
    Date::now() - start
}

// ============================================================================
// Unit Tests
// ============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_generate_trigrams_ascii() {
        let trigrams = TrigramIndex::generate_trigrams("hello");
        assert_eq!(trigrams.len(), 3); // "hel", "ell", "llo"
        assert!(trigrams.contains(&"hel".to_string()));
        assert!(trigrams.contains(&"ell".to_string()));
        assert!(trigrams.contains(&"llo".to_string()));
    }

    #[test]
    fn test_generate_trigrams_too_short() {
        // Less than 3 chars - should return empty
        assert_eq!(TrigramIndex::generate_trigrams("ab").len(), 0);
        assert_eq!(TrigramIndex::generate_trigrams("a").len(), 0);
        assert_eq!(TrigramIndex::generate_trigrams("").len(), 0);
    }

    #[test]
    fn test_generate_trigrams_cjk() {
        // Chinese: "上海" (2 chars, 6 bytes) - too short for trigrams
        let trigrams = TrigramIndex::generate_trigrams("上海");
        assert_eq!(trigrams.len(), 0, "2-char CJK should produce no trigrams");

        // Chinese: "北京市" (3 chars, 9 bytes) - should produce 1 trigram
        let trigrams = TrigramIndex::generate_trigrams("北京市");
        assert_eq!(trigrams.len(), 1);
        assert!(trigrams.contains(&"北京市".to_string()));

        // Chinese: "张三李四" (4 chars, 12 bytes) - should produce 2 trigrams
        let trigrams = TrigramIndex::generate_trigrams("张三李四");
        assert_eq!(trigrams.len(), 2);
        assert!(trigrams.contains(&"张三李".to_string()));
        assert!(trigrams.contains(&"三李四".to_string()));
    }

    #[test]
    fn test_generate_trigrams_emoji() {
        // Emoji: "👋🌍" (2 chars, 8 bytes) - too short for trigrams
        let trigrams = TrigramIndex::generate_trigrams("👋🌍");
        assert_eq!(trigrams.len(), 0);

        // Emoji: "👋🌍😀" (3 chars, 12 bytes) - should produce 1 trigram
        let trigrams = TrigramIndex::generate_trigrams("👋🌍😀");
        assert_eq!(trigrams.len(), 1);
        assert!(trigrams.contains(&"👋🌍😀".to_string()));
    }

    #[test]
    fn test_generate_trigrams_latin_diacritics() {
        // "café" (4 chars, 5 bytes - é is 2 bytes)
        let trigrams = TrigramIndex::generate_trigrams("café");
        assert_eq!(trigrams.len(), 2);
        assert!(trigrams.contains(&"caf".to_string()));
        assert!(trigrams.contains(&"afé".to_string()));
    }

    #[test]
    fn test_generate_trigrams_case_insensitive() {
        // Should lowercase before generating trigrams
        let trigrams_lower = TrigramIndex::generate_trigrams("hello");
        let trigrams_upper = TrigramIndex::generate_trigrams("HELLO");
        let trigrams_mixed = TrigramIndex::generate_trigrams("HeLLo");

        assert_eq!(trigrams_lower, trigrams_upper);
        assert_eq!(trigrams_lower, trigrams_mixed);
    }

    #[test]
    fn test_trigram_index_search_ascii() {
        let mut index = TrigramIndex::new();

        // Add some rows
        index.add(0, "hello world");
        index.add(1, "hello there");
        index.add(2, "goodbye world");

        // Search for "hello" - should match rows 0 and 1
        let results = index.search("hello");
        assert_eq!(results.len(), 2);
        assert!(results.contains(&0));
        assert!(results.contains(&1));

        // Search for "world" - should match rows 0 and 2
        let results = index.search("world");
        assert_eq!(results.len(), 2);
        assert!(results.contains(&0));
        assert!(results.contains(&2));

        // Search for "goodbye" - should match row 2 only
        let results = index.search("goodbye");
        assert_eq!(results.len(), 1);
        assert!(results.contains(&2));
    }

    #[test]
    fn test_trigram_index_search_short_query() {
        let mut index = TrigramIndex::new();
        index.add(0, "hello world");

        // Query too short (< 3 chars) - should return empty
        // (caller must do full scan)
        let results = index.search("hi");
        assert_eq!(results.len(), 0);
    }

    #[test]
    fn test_trigram_index_search_cjk_short_query() {
        let mut index = TrigramIndex::new();

        // Add CJK text
        index.add(0, "上海市");
        index.add(1, "北京市");

        // Search for 2-char CJK query "上海" (6 bytes, but only 2 chars)
        // Should return empty because it's too short for trigrams
        let results = index.search("上海");
        assert_eq!(results.len(), 0, "2-char CJK query should return empty - caller must full-scan");

        // Search for 3-char CJK query "上海市" (9 bytes, 3 chars)
        // Should match row 0
        let results = index.search("上海市");
        assert_eq!(results.len(), 1);
        assert!(results.contains(&0));
    }

    #[test]
    fn test_trigram_index_remove() {
        let mut index = TrigramIndex::new();

        index.add(0, "hello");
        index.add(1, "hello");

        // Both should match
        let results = index.search("hello");
        assert_eq!(results.len(), 2);

        // Remove row 0
        index.remove(0, "hello");

        // Only row 1 should match
        let results = index.search("hello");
        assert_eq!(results.len(), 1);
        assert!(results.contains(&1));
    }

    #[test]
    fn test_trigram_index_update() {
        let mut index = TrigramIndex::new();

        index.add(0, "hello");

        // Should match "hello"
        assert_eq!(index.search("hello").len(), 1);
        assert_eq!(index.search("world").len(), 0);

        // Update row 0 from "hello" to "world"
        index.update(0, "hello", "world");

        // Should now match "world", not "hello"
        assert_eq!(index.search("hello").len(), 0);
        assert_eq!(index.search("world").len(), 1);
    }

    #[test]
    fn test_posting_lists_are_sorted() {
        let mut index = TrigramIndex::new();

        // Add rows out of order
        index.add(5, "hello");
        index.add(1, "hello");
        index.add(3, "hello");
        index.add(2, "hello");

        // Get the posting list for "hel" trigram
        let posting_list = index.index.get("hel").unwrap();

        // Should be sorted
        assert_eq!(posting_list, &vec![1, 2, 3, 5]);
    }

    #[test]
    fn test_intersect_sorted() {
        let a = vec![1, 3, 5, 7, 9];
        let b = vec![2, 3, 5, 8, 10];

        let result = TrigramIndex::intersect_sorted(&a, &b);

        assert_eq!(result, vec![3, 5]);
    }

    #[test]
    fn test_intersect_sorted_empty() {
        let a = vec![1, 2, 3];
        let b = vec![4, 5, 6];

        let result = TrigramIndex::intersect_sorted(&a, &b);

        assert_eq!(result, vec![]);
    }

    #[test]
    fn test_intersect_sorted_with_empty() {
        let a = vec![1, 2, 3];
        let b: Vec<u32> = vec![];

        let result = TrigramIndex::intersect_sorted(&a, &b);

        assert_eq!(result, vec![]);
    }

    #[test]
    fn test_multi_trigram_intersection() {
        let mut index = TrigramIndex::new();

        // Add rows with overlapping text
        index.add(0, "hello world");
        index.add(1, "hello there");
        index.add(2, "say hello world today");  // Contains "hello world" substring
        index.add(3, "goodbye world");

        // Multi-trigram query "hello world" should match rows 0 and 2
        // Row 0: exact match
        // Row 2: contains "hello world" as substring
        // Row 1: has "hello" but not "world"
        // Row 3: has "world" but not "hello"
        let results = index.search("hello world");

        // Results should contain rows that have ALL trigrams from "hello world"
        assert!(results.contains(&0), "Row 0 should match (exact)");
        assert!(results.contains(&2), "Row 2 should match (contains substring)");
        assert_eq!(results.len(), 2, "Should match exactly 2 rows");
    }

    #[test]
    fn test_contains_case_insensitive() {
        // Basic ASCII (uses fast path, no cache needed)
        assert!(GridStore::contains_case_insensitive("Hello World", "world", None));
        assert!(GridStore::contains_case_insensitive("UPPERCASE", "upper", None));
        assert!(GridStore::contains_case_insensitive("MixedCase", "mixed", None));

        // Not found
        assert!(!GridStore::contains_case_insensitive("hello", "world", None));

        // Empty filter
        assert!(GridStore::contains_case_insensitive("anything", "", None));

        // CJK (non-ASCII, needs char cache)
        let cjk_filter_chars: Vec<char> = "上海".chars().collect();
        assert!(GridStore::contains_case_insensitive("上海市", "上海", Some(&cjk_filter_chars)));

        // Emoji (non-ASCII, needs char cache)
        let emoji_filter_chars: Vec<char> = "👋".chars().collect();
        assert!(GridStore::contains_case_insensitive("Hello 👋 World", "👋", Some(&emoji_filter_chars)));

        // ASCII filter on non-ASCII text (the panic bug case - should NOT panic)
        // This is the scenario: filter="beijing" (ASCII), text="北京" (non-ASCII)
        // Cache is None because filter is ASCII, but slow path is entered because text is non-ASCII
        // Should lazily collect filter chars instead of panicking
        assert!(!GridStore::contains_case_insensitive("北京", "beijing", None));
        assert!(!GridStore::contains_case_insensitive("上海", "shanghai", None));

        // Positive case: ASCII filter that DOES match transliterated content
        assert!(GridStore::contains_case_insensitive("Beijing 北京", "beijing", None));
    }
}
