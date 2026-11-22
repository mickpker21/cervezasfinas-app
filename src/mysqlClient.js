class SupabaseQueryBuilder {
  constructor(table) {
    this.table = table;
    this._select = '*';
    this._eq = {};
    this._limit = null;
    this._single = false;
  }

  select(cols) {
    this._select = cols;
    return this;
  }

  eq(col, val) {
    this._eq[col] = val;
    return this;
  }

  limit(n) {
    this._limit = n;
    return this;
  }

  single() {
    this._single = true;
    return this;
  }

  maybeSingle() {
    this._single = true;
    return this;
  }

  order(col, opts) {
    // Basic mock, ordering not fully implemented in frontend adapter
    return this;
  }

  async update(data) {
    try {
      const payload = { ...data };
      if (this._eq['id']) {
        payload.id = this._eq['id'];
      }
      const res = await fetch(`/hr_api.php?action=update&table=${this.table}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      return { data: json.success ? json : null, error: json.error || null };
    } catch (error) {
      return { data: null, error };
    }
  }

  async insert(data) {
    try {
      const res = await fetch(`/hr_api.php?action=insert&table=${this.table}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      const json = await res.json();
      return { data: json.success ? json : null, error: json.error || null };
    } catch (error) {
      return { data: null, error };
    }
  }

  // Make it awaitable
  then(resolve, reject) {
    this.execute().then(resolve).catch(reject);
  }

  async execute() {
    try {
      let url = `/hr_api.php?action=get&table=${this.table}`;
      // Add simple filtering if needed
      if (this._eq['employee_id']) {
        url += `&employee_id=${encodeURIComponent(this._eq['employee_id'])}`;
      }
      
      const res = await fetch(url);
      const json = await res.json();
      
      if (!json.success) {
        return { data: null, error: json.error };
      }

      let data = json.data;

      // Apply basic local filtering for other eqs
      for (const [key, val] of Object.entries(this._eq)) {
        if (key !== 'employee_id') {
          data = data.filter(item => item[key] == val);
        }
      }

      if (this._limit) {
        data = data.slice(0, this._limit);
      }

      if (this._single) {
        data = data.length > 0 ? data[0] : null;
      }

      return { data, error: null };
    } catch (error) {
      return { data: null, error };
    }
  }
}

export const supabase = {
  from: (table) => new SupabaseQueryBuilder(table)
};
