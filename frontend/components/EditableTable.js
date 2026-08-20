export default function EditableTable({ table, onChange }) {
  const { headers, rows } = table;

  const updateHeader = (colIdx, value) => {
    const newHeaders = [...headers];
    newHeaders[colIdx] = value;
    onChange({ ...table, headers: newHeaders });
  };

  const updateCell = (rowIdx, colIdx, value) => {
    const newRows = rows.map(r => [...r]);
    newRows[rowIdx][colIdx] = value;
    onChange({ ...table, rows: newRows });
  };

  return (
    <div className="table-wrap">
      <table className="data-grid">
        <thead>
          <tr>
            {headers.map((h, colIdx) => (
              <th key={colIdx}>
                <input
                  value={h}
                  onChange={e => updateHeader(colIdx, e.target.value)}
                  aria-label={`Column ${colIdx + 1} header`}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIdx) => (
            <tr key={rowIdx}>
              {row.map((cell, colIdx) => (
                <td key={colIdx}>
                  <input
                    value={cell}
                    onChange={e => updateCell(rowIdx, colIdx, e.target.value)}
                    aria-label={`Row ${rowIdx + 1}, column ${colIdx + 1}`}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
