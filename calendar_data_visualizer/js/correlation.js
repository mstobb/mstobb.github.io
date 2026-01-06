
export function renderCorrelations(data, container) {
    if (!data || data.length === 0) return;

    // 1. Identify Numeric Columns
    // Filter out Date. Check if values are mostly numeric.
    // We already have 'attributes' in main app state, but let's derive from data sample
    const sample = data[0];
    const numericAttrs = Object.keys(sample).filter(key => {
        if (key === 'date' || key === 'rawDate') return false;
        // Check if value is number
        return typeof sample[key] === 'number';
    });

    if (numericAttrs.length < 2) {
        document.getElementById('matrix-container').innerHTML = "<p class='text-slate-400'>Not enough numeric attributes found.</p>";
        return;
    }

    // 2. Calculate Correlation Matrix
    const matrix = [];
    numericAttrs.forEach((attr1, i) => {
        numericAttrs.forEach((attr2, j) => {
            const corr = calculatePearsonCorrelation(data, attr1, attr2);
            matrix.push({
                x: attr1,
                y: attr2,
                value: corr
            });
        });
    });

    // 3. Render Matrix
    drawMatrix(data, numericAttrs, matrix);
}

function calculatePearsonCorrelation(data, attr1, attr2) {
    const validData = data.filter(d =>
        d[attr1] !== null && d[attr1] !== undefined && !isNaN(d[attr1]) &&
        d[attr2] !== null && d[attr2] !== undefined && !isNaN(d[attr2])
    );

    if (validData.length === 0) return 0;

    const n = validData.length;
    const sum1 = d3.sum(validData, d => d[attr1]);
    const sum2 = d3.sum(validData, d => d[attr2]);
    const sum1Sq = d3.sum(validData, d => d[attr1] ** 2);
    const sum2Sq = d3.sum(validData, d => d[attr2] ** 2);
    const pSum = d3.sum(validData, d => d[attr1] * d[attr2]);

    const num = pSum - (sum1 * sum2 / n);
    const den = Math.sqrt((sum1Sq - sum1 ** 2 / n) * (sum2Sq - sum2 ** 2 / n));

    if (den === 0) return 0;
    return num / den;
}

function drawMatrix(data, attributes, matrix) {
    const container = document.getElementById('matrix-container');
    container.innerHTML = '';

    const size = Math.min(container.clientWidth, container.clientHeight, 500);
    const margin = { top: 30, right: 0, bottom: 0, left: 80 }; // Left for labels

    // Adjust margins based on label length?
    // Let's assume standard.

    const width = size - margin.left - margin.right;
    const height = size - margin.top - margin.bottom;

    const svg = d3.select(container)
        .append("svg")
        .attr("width", size)
        .attr("height", size)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    // Scales
    const x = d3.scaleBand()
        .range([0, width])
        .domain(attributes)
        .padding(0.01);

    const y = d3.scaleBand()
        .range([0, height])
        .domain(attributes)
        .padding(0.01);

    // Color Scale: -1 (Blue) to 0 (White) to 1 (Red)
    const color = d3.scaleLinear()
        .domain([-1, 0, 1])
        .range(["#f87171", "#ffffff", "#0ea5e9"]); // Red to white to Blue (Actually Brand Blue)

    // Axes (Custom)
    svg.append("g")
        .attr("transform", `translate(0, -5)`)
        .selectAll("text")
        .data(attributes)
        .enter()
        .append("text")
        .text(d => d)
        .attr("x", d => x(d) + x.bandwidth() / 2)
        .attr("y", 0)
        .attr("text-anchor", "start")
        .attr("transform", d => `rotate(-45, ${x(d) + x.bandwidth() / 2}, 0)`)
        .style("font-size", "10px")
        .style("fill", (config && config.textColor) || "#64748b");

    svg.append("g")
        .selectAll("text")
        .data(attributes)
        .enter()
        .append("text")
        .text(d => d)
        .attr("x", -5)
        .attr("y", d => y(d) + y.bandwidth() / 2 + 3) // Center vertical
        .attr("text-anchor", "end")
        .style("font-size", "10px")
        .style("fill", (config && config.textColor) || "#64748b");


    // Squares
    svg.selectAll()
        .data(matrix, function (d) { return d.x + ':' + d.y; })
        .enter()
        .append("rect")
        .attr("x", function (d) { return x(d.x) })
        .attr("y", function (d) { return y(d.y) })
        .attr("width", x.bandwidth())
        .attr("height", y.bandwidth())
        .style("fill", function (d) { return color(d.value) })
        .style("stroke", "#e2e8f0")
        .style("cursor", "pointer")
        .on("mouseover", function (event, d) {
            d3.select(this).style("stroke", "#0ea5e9").style("stroke-width", 2);
        })
        .on("mouseout", function (event, d) {
            d3.select(this).style("stroke", "#e2e8f0").style("stroke-width", 1);
        })
        .on("click", function (event, d) {
            // Draw scatter
            drawScatter(data, d.x, d.y);

            // Highlight active cell (reset others)
            svg.selectAll("rect").attr("class", "");
            d3.select(this).attr("class", "active");
        })
        .append("title")
        .text(d => `${d.x} vs ${d.y}: ${d.value.toFixed(2)}`);

}

function drawScatter(data, attrX, attrY) {
    const container = document.getElementById('scatter-container');
    container.innerHTML = '';

    const width = container.clientWidth;
    const height = 400; // Fixed height
    const margin = { top: 20, right: 20, bottom: 40, left: 40 };

    const svg = d3.select(container)
        .append("svg")
        .attr("width", width)
        .attr("height", height)
        .append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    // Label Header
    svg.append("text")
        .attr("x", (width - margin.left - margin.right) / 2)
        .attr("y", 0)
        .attr("text-anchor", "middle")
        .style("font-size", "12px")
        .style("font-weight", "bold")
        .style("fill", "#475569")
        .text(`${attrX} vs ${attrY}`);

    const cleanData = data.filter(d =>
        !isNaN(d[attrX]) && !isNaN(d[attrY])
    );

    const x = d3.scaleLinear()
        .domain(d3.extent(cleanData, d => d[attrX])).nice()
        .range([0, width - margin.left - margin.right]);

    const y = d3.scaleLinear()
        .domain(d3.extent(cleanData, d => d[attrY])).nice()
        .range([height - margin.top - margin.bottom, 0]);

    // X Axis
    svg.append("g")
        .attr("transform", `translate(0, ${height - margin.top - margin.bottom})`)
        .call(d3.axisBottom(x));

    // X Label
    svg.append("text")
        .attr("x", (width - margin.left - margin.right) / 2)
        .attr("y", height - margin.top - margin.bottom + 35)
        .style("text-anchor", "middle")
        .text(attrX)
        .style("font-size", "10px");

    // Y Axis
    svg.append("g")
        .call(d3.axisLeft(y));

    // Y Label
    svg.append("text")
        .attr("transform", "rotate(-90)")
        .attr("y", -30)
        .attr("x", -(height - margin.top - margin.bottom) / 2)
        .style("text-anchor", "middle")
        .text(attrY)
        .style("font-size", "10px");

    // Dots
    svg.append('g')
        .selectAll("dot")
        .data(cleanData)
        .enter()
        .append("circle")
        .attr("cx", function (d) { return x(d[attrX]); })
        .attr("cy", function (d) { return y(d[attrY]); })
        .attr("r", 3)
        .style("fill", "#0ea5e9") // Brand blue
        .style("opacity", 0.6)
        .style("stroke", "white")
        .append("title")
        .text((d) => `${d.date.toDateString()}\n${attrX}: ${d[attrX]}\n${attrY}: ${d[attrY]}`);

}
