
export function parseCSV(file) {
    return new Promise((resolve, reject) => {
        Papa.parse(file, {
            header: false, // We'll handle headers manually due to the empty first columns
            skipEmptyLines: true,
            complete: function (results) {
                try {
                    const rawData = results.data;
                    if (rawData.length < 2) {
                        reject(new Error("File is too short"));
                        return;
                    }

                    // Row 0 is headers
                    const originalHeaders = rawData[0];
                    const dataRows = rawData.slice(1);

                    // Detect Attributes: Columns that have a header name
                    // Based on sample: col 0 is empty (Date), col 1 is empty (Index?), col 2+ are attributes
                    const attributes = [];
                    const attributeIndices = [];

                    originalHeaders.forEach((header, index) => {
                        const trimmed = header ? header.trim() : "";
                        if (trimmed && index >= 2) {
                            attributes.push(trimmed);
                            attributeIndices.push(index);
                        }
                    });

                    // Parse Rows
                    const parsedData = dataRows.map(row => {
                        // Date is Column 0
                        const dateStr = row[0];
                        const date = new Date(dateStr);

                        // Parse Attributes
                        const rowData = {
                            date: date,
                            rawDate: dateStr
                        };

                        attributeIndices.forEach(idx => {
                            const attrName = originalHeaders[idx].trim();
                            const valStr = row[idx];

                            // Try to parse number, remove commas
                            // Handle '10:08:00 PM' -> logic? User said "quantitative or binary".
                            // For now, let's try to parse as float. If NaN, keep as string.
                            // The sample shows "10:08:00 PM", which is a Time.
                            // The sample shows "2,817", which is a number.

                            let val = valStr;

                            if (typeof valStr === 'string') {
                                // Remove commas for numbers like "2,817"
                                const cleanStr = valStr.replace(/,/g, '');
                                if (!isNaN(cleanStr) && cleanStr.trim() !== '') {
                                    val = parseFloat(cleanStr);
                                }
                            }

                            rowData[attrName] = val;
                        });

                        return rowData;
                    });

                    // Log sample for debug
                    console.log("Attributes found:", attributes);
                    console.log("First parsed row:", parsedData[0]);

                    resolve({
                        data: parsedData,
                        attributes: attributes
                    });

                } catch (e) {
                    console.error("Parsing error logic", e);
                    reject(e);
                }
            },
            error: function (err) {
                console.error("Papa parse error", err);
                reject(err);
            }
        });
    });
}
