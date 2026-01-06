
export function render(data, container, config) {
    if (!data || data.length === 0) return;

    // Clear Previous
    container.innerHTML = '';

    // Dimensions
    const width = container.clientWidth;
    const height = container.clientHeight;
    // For main view, we might want a fixed height or auto. 
    // The previous implementation used auto height.
    const margin = { top: 20, right: 20, bottom: 20, left: 40 };

    // SVG
    const svg = d3.select(container)
        .append("svg")
        .attr("width", width)
        .attr("height", height) // Will be updated by layouts
        .attr("viewBox", [0, 0, width, height])
        .style("max-width", "100%")
        .style("height", "auto");

    // Color Scale
    const { colorScale, emptyColor } = createColorScale(data, config);

    // Dispatch Layout
    if (config.layout === 'week') {
        drawWeekRows(svg, data, width, height, margin, colorScale, config, emptyColor);
    } else if (config.layout === 'month') {
        drawMonthGrid(svg, data, width, height, margin, colorScale, config, emptyColor);
    } else if (config.layout === 'neatocal') {
        drawNeatocal(svg, data, width, height, margin, colorScale, config, emptyColor);
    }

    // --- Update Stats ---
    calculateStats(data, config);
    drawLineChart(data, config);
}

function createColorScale(data, config) {
    const attr = config.attribute;
    const activeColor = config.colors.active;
    const bg = config.colors.bg;

    // Check if attribute is binary (0/1) or quantitative
    const values = data.map(d => d[attr]).filter(v => v !== undefined && v !== null && !isNaN(v));
    const max = d3.max(values) || 1;
    const min = d3.min(values) || 0;

    // Sequential Scale: Background -> ActiveColor
    const scale = d3.scaleLinear()
        .domain([min, max])
        .range([bg, activeColor])
        .unknown(bg);

    return { colorScale: scale, emptyColor: bg };
}

// =============================================================================
// STATISTICS & CHARTS
// =============================================================================

function calculateStats(data, config) {
    const attr = config.attribute;
    const values = data.map(d => d[attr]).filter(v => typeof v === 'number' && !isNaN(v));

    const totalEl = document.getElementById('stat-total');
    const avgEl = document.getElementById('stat-avg');
    const maxEl = document.getElementById('stat-max');
    const countEl = document.getElementById('stat-count');

    if (values.length === 0) {
        if (totalEl) totalEl.textContent = '-';
        if (avgEl) avgEl.textContent = '-';
        if (maxEl) maxEl.textContent = '-';
        if (countEl) countEl.textContent = '-';
        return;
    }

    const total = d3.sum(values);
    const avg = d3.mean(values);
    const max = d3.max(values);
    // Count "Active" days (val > 0)
    const activeCount = values.filter(v => v > 0).length;
    const activePct = (activeCount / values.length) * 100;

    // Formatting
    const formatNum = d3.format(",.1f"); // 1 decimal place
    const formatInt = d3.format(",");

    if (totalEl) totalEl.textContent = formatNum(total);
    if (avgEl) avgEl.textContent = formatNum(avg);
    if (maxEl) maxEl.textContent = formatNum(max);
    if (countEl) countEl.textContent = `${formatInt(activeCount)} (${activePct.toFixed(0)}%)`;
}

function drawLineChart(data, config) {
    const container = document.getElementById('chart-container');
    if (!container) return;
    container.innerHTML = ''; // Clear

    const width = container.clientWidth;
    const height = container.clientHeight;
    const margin = { top: 10, right: 10, bottom: 20, left: 30 };

    const svg = d3.select(container)
        .append("svg")
        .attr("width", width)
        .attr("height", height);

    const attr = config.attribute;
    const cleanData = data.filter(d => !isNaN(d[attr]) && d[attr] !== null && d[attr] !== undefined)
        .sort((a, b) => a.date - b.date);

    if (cleanData.length < 2) return;

    // X Scale (Time)
    const x = d3.scaleTime()
        .domain(d3.extent(cleanData, d => d.date))
        .range([margin.left, width - margin.right]);

    // Y Scale (Linear)
    const y = d3.scaleLinear()
        .domain([0, d3.max(cleanData, d => d[attr])])
        .nice()
        .range([height - margin.bottom, margin.top]);

    // Area Generator (for visual flair)
    // We can use config.colors.active for the fill, but make it semi-transparent
    const area = d3.area()
        .curve(d3.curveMonotoneX)
        .x(d => x(d.date))
        .y0(y(0))
        .y1(d => y(d[attr]));

    // Line Generator
    const line = d3.line()
        .curve(d3.curveMonotoneX)
        .x(d => x(d.date))
        .y(d => y(d[attr]));

    // Gradients? Let's just use simple opacity.

    // Path (Area)
    svg.append("path")
        .datum(cleanData)
        .attr("fill", config.colors.active)
        .attr("fill-opacity", 0.1)
        .attr("d", area);

    // Path (Line)
    svg.append("path")
        .datum(cleanData)
        .attr("fill", "none")
        .attr("stroke", config.colors.active)
        .attr("stroke-width", 2)
        .attr("d", line);

    // Axes
    const xAxis = g => g
        .attr("transform", `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(x).ticks(width / 80).tickSizeOuter(0))
        .call(g => g.select(".domain").remove()); // Remove bottom bar for cleaner look

    const yAxis = g => g
        .attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(y).ticks(5))
        .call(g => g.select(".domain").remove())
        .call(g => g.selectAll(".tick line").clone()
            .attr("x2", width - margin.left - margin.right)
            .attr("stroke-opacity", 0.1)) // Grid lines
        .call(g => g.selectAll(".tick text").attr("x", -5));

    svg.append("g").call(xAxis);
    svg.append("g").call(yAxis);
}


// =============================================================================
// LAYOUT: WEEK ROWS (Year is tall column, Weeks are rows)
// =============================================================================
function drawWeekRows(svg, data, width, height, margin, colorScale, config, emptyColor) {
    // We'll stack years vertically if multiple
    let currentY = margin.top;
    const cellSize = 12;
    const cellPadding = 2;
    const effectiveCell = cellSize + cellPadding;

    // Helper: Week of Year
    // Use %U (Sunday-based weeks) instead of %W (Monday-based) to ensure Sunday is start of row
    const weekFormat = d3.timeFormat("%U");
    const dayFormat = d3.timeFormat("%w"); // 0-6 Sun-Sat

    const dataByYear = d3.group(data, d => d.date.getFullYear());
    const years = Array.from(dataByYear.keys()).sort();

    years.forEach(year => {
        const yearData = dataByYear.get(year);

        // Year Label
        svg.append("text")
            .attr("x", margin.left)
            .attr("y", currentY)
            .text(year)
            .attr("font-weight", "bold")
            .attr("fill", config.textColor || "#64748b");

        currentY += 20;

        const g = svg.append("g")
            .attr("transform", `translate(${margin.left}, ${currentY})`);

        // Days Header
        const days = ["S", "M", "T", "W", "T", "F", "S"];
        days.forEach((d, i) => {
            g.append("text")
                .attr("x", i * effectiveCell + cellSize / 2)
                .attr("y", -5)
                .attr("text-anchor", "middle")
                .attr("font-size", "8px")
                .attr("fill", config.textColor || "#94a3b8")
                .text(d);
        });

        // Draw Cells
        yearData.forEach(d => {
            const week = +weekFormat(d.date);
            const day = +dayFormat(d.date);

            g.append("rect")
                .attr("x", day * effectiveCell)
                .attr("y", week * effectiveCell)
                .attr("width", cellSize)
                .attr("height", cellSize)
                .attr("rx", 2)
                .attr("fill", (d[config.attribute] !== undefined) ? colorScale(d[config.attribute]) : emptyColor)
                .append("title")
                .text(`${d.date.toDateString()}: ${d[config.attribute]}`);
        });

        currentY += (53 * effectiveCell) + 40; // Space for next year
    });

    // Adjust SVG height if needed to scroll
    if (currentY > height) {
        svg.attr("height", currentY + margin.bottom);
    }
}

// =============================================================================
// LAYOUT: MONTH GRID (3x4)
// =============================================================================
function drawMonthGrid(svg, data, width, height, margin, colorScale, config, emptyColor) {
    let currentY = margin.top;
    const cellSlize = 12;
    const cellPadding = 2;
    const effectiveCell = cellSlize + cellPadding;
    const monthMargin = 20;

    const dataByYear = d3.group(data, d => d.date.getFullYear());
    const years = Array.from(dataByYear.keys()).sort();

    years.forEach(year => {
        const yearData = dataByYear.get(year);

        // Year Header
        svg.append("text")
            .attr("x", margin.left)
            .attr("y", currentY)
            .text(year)
            .attr("font-weight", "bold")
            .attr("fill", config.textColor || "#64748b");

        currentY += 30;

        // Group by Month
        const months = d3.range(0, 12);

        months.forEach(monthIdx => {
            // Grid Position (3 cols)
            const col = monthIdx % 3;
            const row = Math.floor(monthIdx / 3);

            const monthX = margin.left + (col * (7 * effectiveCell + monthMargin));
            const monthY = currentY + (row * (8 * effectiveCell + monthMargin));

            const g = svg.append("g")
                .attr("transform", `translate(${monthX}, ${monthY})`);

            // Month Label
            const monthName = new Date(year, monthIdx, 1).toLocaleString('default', { month: 'short' });
            g.append("text")
                .attr("x", 0)
                .attr("y", -10)
                .text(monthName)
                .attr("font-size", "10px")
                .attr("fill", config.textColor || "#64748b");

            // Data for this month
            const monthData = yearData.filter(d => d.date.getMonth() === monthIdx);

            // Draw Days
            // We need to know where the month starts.
            const firstDay = new Date(year, monthIdx, 1);
            const startDayOffset = firstDay.getDay(); // 0 (Sun) - 6 (Sat)

            // Render all days in month
            const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();

            for (let d = 1; d <= daysInMonth; d++) {
                const date = new Date(year, monthIdx, d);
                const dayOfWeek = date.getDay();

                // Position logic
                // Standard calendar: Row 0 is first week, etc.
                const offsetDate = d + startDayOffset - 1;
                const r = Math.floor(offsetDate / 7);
                const c = dayOfWeek;

                const val = monthData.find(item => item.date.getDate() === d);

                g.append("rect")
                    .attr("x", c * effectiveCell)
                    .attr("y", r * effectiveCell)
                    .attr("width", cellSlize)
                    .attr("height", cellSlize)
                    .attr("rx", 2)
                    .attr("fill", (val && val[config.attribute] !== undefined) ? colorScale(val[config.attribute]) : emptyColor)
                    .append("title")
                    .text(`${date.toDateString()}: ${val ? val[config.attribute] : 'N/A'}`);
            }
        });

        // Advance Y for next year (4 rows of months approx)
        currentY += (4 * (8 * effectiveCell + monthMargin)) + 50;
    });

    if (currentY > height) {
        svg.attr("height", currentY + margin.bottom);
    }
}

// =============================================================================
// LAYOUT: NEATOCAL (Vertical Columns)
// =============================================================================
function drawNeatocal(svg, data, width, height, margin, colorScale, config, emptyColor) {
    let currentY = margin.top;
    const cellSize = 12;
    const cellPadding = 2;
    const effectiveCell = cellSize + cellPadding;
    const colSpacing = 20;

    const dataByYear = d3.group(data, d => d.date.getFullYear());
    const years = Array.from(dataByYear.keys()).sort();

    years.forEach(year => {
        // Year Header
        svg.append("text")
            .attr("x", margin.left)
            .attr("y", currentY)
            .text(year)
            .attr("font-weight", "bold")
            .attr("fill", config.textColor || "#64748b");

        currentY += 40; // More space for column headers

        const g = svg.append("g")
            .attr("transform", `translate(${margin.left}, ${currentY})`);

        const months = d3.range(0, 12);

        months.forEach(monthIdx => {
            const monthData = dataByYear.get(year).filter(d => d.date.getMonth() === monthIdx);
            const firstDay = new Date(year, monthIdx, 1);
            const startOffset = firstDay.getDay(); // 0=Sun

            const colX = monthIdx * (cellSize + colSpacing);

            // Month Header
            g.append("text")
                .attr("x", colX + cellSize / 2)
                .attr("y", -10)
                .attr("text-anchor", "middle")
                .text(firstDay.toLocaleString('default', { month: 'narrow' }))
                .attr("font-size", "10px")
                .attr("fill", config.textColor || "#64748b");

            // Days
            const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();

            for (let d = 1; d <= daysInMonth; d++) {
                // Row = (d - 1) + startOffset.
                const rowIndex = (d - 1) + startOffset;
                const val = monthData.find(item => item.date.getDate() === d);

                g.append("rect")
                    .attr("x", colX)
                    .attr("y", rowIndex * effectiveCell)
                    .attr("width", cellSize)
                    .attr("height", cellSize)
                    .attr("rx", 2)
                    .attr("fill", (val && val[config.attribute] !== undefined) ? colorScale(val[config.attribute]) : emptyColor)
                    .append("title")
                    .text(`${new Date(year, monthIdx, d).toDateString()}: ${val ? val[config.attribute] : 'N/A'}`);
            }
        });

        // Advance Y
        currentY += (37 * effectiveCell) + 50;
    });

    if (currentY > height) {
        svg.attr("height", currentY + margin.bottom);
    }
}
