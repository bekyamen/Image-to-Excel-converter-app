export default function EditableTable({ table, onChange, onFocusCell }) {
  const { headers, rows } = table;

  const updateHeader = (colIdx, value) => {
    const newHeaders = [...headers];
    newHeaders[colIdx] = value;
    onChange({ ...table, headers: newHeaders });
  };

  const updateCell = (rowIdx, colIdx, newValue) => {
    const newRows = rows.map(r => [...r]);
    newRows[rowIdx][colIdx] = { ...newRows[rowIdx][colIdx], value: newValue, confident: true };
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
              {row.map((cellObj, colIdx) => {
                // Backward compatibility: handle if cell is just a string
                const isObject = typeof cellObj === 'object' && cellObj !== null;
                const cellValue = isObject ? cellObj.value : cellObj;
                const isConfident = isObject ? cellObj.confident : true;

                return (
                  <td
                    key={colIdx}
                    style={{ backgroundColor: !isConfident ? (isObject && cellObj.isHandwritten ? '#ffcdcd' : '#fff3cd') : 'transparent' }}
                    title={!isConfident ? 'Please verify this value' : ''}
                    onClick={() => { if(onFocusCell && isObject && cellObj.boundingBox) onFocusCell(cellObj.boundingBox); }}
                  >
                    <input
                      style={{ backgroundColor: 'transparent' }}
                      value={cellValue || ''}
                      onChange={e => updateCell(rowIdx, colIdx, e.target.value)}
                      onFocus={() => { if(onFocusCell && isObject && cellObj.boundingBox) onFocusCell(cellObj.boundingBox); }}
                      aria-label={`Row ${rowIdx + 1}, column ${colIdx + 1}`}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
