
function normalizeHeader(h) {
  return String(h || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
}

function buildHeaderMap(headers, candidates) {
  const map = {};
  const scores = {}; // target -> score (lower is better)

  for (let idx = 0; idx < headers.length; idx++) {
    const key = normalizeHeader(headers[idx]);
    for (const target in candidates) {
      const score = candidates[target].indexOf(key);
      if (score !== -1) {
        // Only map if it's the first match for this target OR if this match is "better" (lower index in candidates list)
        if (map[target] === undefined || score < scores[target]) {
          map[target] = idx;
          scores[target] = score;
        }
        // Note: we don't break here because the same column might match multiple targets? 
        // Actually, in the original code it breaks.
        // If we break, we might miss other targets. 
        // But for a single target, we found a match.
      }
    }
  }
  return map;
}

const candidates = {
    cve_cliente: [
      "cve_cliente",
      "client_code",
      "codigo_cliente",
      "cod_cliente",
      "id_cliente",
      "cliente",
    ],
};

console.log("Test 1: ['Cve_Cliente', 'Cliente']");
console.log(buildHeaderMap(["Cve_Cliente", "Cliente"], candidates)); 
// Expected: { cve_cliente: 0 } because Cve_Cliente has score 0, Cliente has score 5.

console.log("Test 2: ['Cliente', 'Cve_Cliente']");
console.log(buildHeaderMap(["Cliente", "Cve_Cliente"], candidates));
// Expected: { cve_cliente: 1 } because Cve_Cliente (score 0) beats Cliente (score 5).

console.log("Test 3: ['Codigo Cliente']");
console.log(buildHeaderMap(["Codigo Cliente"], candidates));
// Expected: { cve_cliente: 0 }
