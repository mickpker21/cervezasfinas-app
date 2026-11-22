export const exportToCSV = (data, filename, headersOverride) => {
  // Construir headers
  let headers;
  if (Array.isArray(headersOverride) && headersOverride.length > 0) {
    headers = headersOverride;
  } else {
    const headersSet = new Set();
    data.forEach(row => { Object.keys(row).forEach(k => headersSet.add(k)); });
    headers = Array.from(headersSet);
  }
  const csvContent = [
    headers.join(","),
    ...data.map(row => headers.map(h => (row[h] ?? '')).join(","))
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};