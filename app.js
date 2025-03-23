const eventSource = new EventSource(`//lehre.bpm.in.tum.de/ports/6333/sse?instance=${instance}`);

let eventData = {}; // Store data for each event_name
let toolChangeTimestamps = [];
let firstTimestamp = null;
let pastToolChanges = [];

// this file is the same as app_individual just that event_names are already defined, not supplied by the html
// only differences will be commented on
const event_names = [
    "MaxxTurn45/Axes/Power/Active/A",
    "MaxxTurn45/Axes/Power/Active/B",
    "MaxxTurn45/Axes/Power/Active/C",
    "MaxxTurn45/Axes/Power/Active/Sum"
];

GR.ready(function() {
    var grInstance = new GR("gr-canvas");

    function updatePlot() {
        grInstance.clearws();
        grInstance.setviewport(0.25, 0.1, 0.1, 0.95);
        grInstance.setcharheight(0.014);

        let allTimes = [];
        let allValues = [];

        Object.keys(eventData).forEach(eventName => {
            let data = eventData[eventName];
            if (data.length > 0) {
                allTimes = allTimes.concat(data.map(d => d.timestamp));
                allValues = allValues.concat(data.map(d => d.value));
            }
        });

        if (allTimes.length === 0) {return;}

        let xmin = Math.min(...allTimes);
        let xmax = Math.max(...allTimes);
        let ymin = Math.min(...allValues);
        let ymax = Math.max(...allValues);

        let yPadding = (ymax - ymin) * 0.1;
        ymin -= yPadding;
        ymax += yPadding;

        let tickX = (xmax - xmin) / 5;
        let tickY = (ymax - ymin) / 5;

        grInstance.setwindow(xmin, xmax, ymin, ymax);

        grInstance.setlinecolorind(1);
        grInstance.grid(tickX, tickY, xmin, ymin, 1, 1);
        // grInstance.axes(tickX, tickY, xmin, ymin, 0, 1, 0.005);
        grInstance.axes(tickX, tickY, xmin, ymin, 1, 1, 0.005);

        // define colors for every sensor id for the line plots
        const colors = {
            "MaxxTurn45/Axes/Power/Active/A": [0.729, 0.333, 0.827], // purple
            "MaxxTurn45/Axes/Power/Active/B": [0, 1, 0], // green
            "MaxxTurn45/Axes/Power/Active/C": [0, 0, 1], // blue
            "MaxxTurn45/Axes/Power/Active/Sum": [1, 0.5, 0]  // orange
        };

        // start color index at 100 to define new colours and avoid conflicts
        let colorIndex = 100;
        // loop over  each sensor id, draw the line plot in their assigned colours
        Object.keys(eventData).forEach(eventName => {
            let data = eventData[eventName];
            if (data.length > 1) {
                const [r, g, b] = colors[eventName] || [1, 1, 1];
                grInstance.setcolorrep(colorIndex, r, g, b);
                grInstance.setlinecolorind(colorIndex);
                grInstance.polyline(data.length, data.map(d => d.timestamp), data.map(d => d.value));
                colorIndex++;
            }
        });

        toolChangeTimestamps.forEach(toolChangeTime => {
            if (toolChangeTime >= xmin && toolChangeTime <= xmax) {

                let xLine = [toolChangeTime, toolChangeTime];
                let yLine = [ymin, ymax];

                grInstance.setlinecolorind(2);
                grInstance.polyline(2, xLine, yLine);
            }
        });

/*
        let tickTimes = Array.from({ length: 5 }, (_, i) => xmin + i * tickX);

        tickTimes.forEach(time => {
            let timeLabel = time.toFixed(3);

            let [xPos, yPos] = grInstance.wctondc(time, ymin);

            yPos = 0.09;

            grInstance.textext(xPos, yPos, timeLabel);
        }); */


        grInstance.settextcolorind(1);
        grInstance.textext(0.5, 0.01, "time (s)");
        grInstance.textext(0.001, 0.5, "power (w)");
    }

    eventSource.onmessage = function(event) {
        const message = JSON.parse(event.data);

        if (event_names.includes(message.id)) {
            if (!eventData[message.id]) {
                eventData[message.id] = [];
            }
            eventData[message.id].push({ timestamp: parseFloat(message.timestamp), value: parseFloat(message.value)});
            updatePlot();
            } else if (message.id === "State/actToolIdent") {
            document.getElementById("actToolIdent").textContent = message.tool;

            if (message.tNumber !== undefined) {
                document.getElementById("actTNumber").textContent = message.tNumber;
            }
            if (message.toolLength1 !== undefined) {
                document.getElementById("actToolLength1").textContent = message.toolLength1;
            }
            if (message.toolRadius !== undefined) {
                document.getElementById("actToolRadius").textContent = message.toolRadius;
            }

            let shiftedTimestamp = parseFloat(message.timestamp) - (parseFloat(shift) / 1000);
            if (!toolChangeTimestamps.includes(shiftedTimestamp)) {
                toolChangeTimestamps.push(shiftedTimestamp);
            }
            updatePlot();
        } else if (message.id === "State/actToolIdentPast") {
            let shiftedTimestamp = parseFloat(message.timestamp) - (parseFloat(shift) / 1000);
            if (!pastToolChanges.some(tc => tc.timestamp === shiftedTimestamp)) {
                pastToolChanges.unshift({ tool: message.tool,
                    timestamp: shiftedTimestamp,
                    tNumber: message.tNumber || "N/A",
                    toolLength1: message.toolLength1 || "N/A",
                    toolRadius: message.toolRadius || "N/A" });
                updatePastToolList();
            }
        }
        else if (message.id === "State/actTNumber") {
            document.getElementById("actTNumber").textContent = message.value;
        }
        else if (message.id === "State/actToolLength1") {
            document.getElementById("actToolLength1").textContent = message.value;
        }
        else if (message.id === "State/actToolRadius") {
            document.getElementById("actToolRadius").textContent = message.value;
        }

    };
    function updatePastToolList() {
        let pastToolList = document.getElementById("pastToolList");
        pastToolList.innerHTML = "";

        pastToolChanges.forEach(toolChange => {
            let listItem = document.createElement("li");
            listItem.innerHTML = `ID: <strong>${toolChange.tool}</strong> - 
                                <span>${toolChange.timestamp.toFixed(3)}s</span><br>
                                Number: ${toolChange.tNumber}, 
                                Length: ${toolChange.toolLength1}, 
                                Radius: ${toolChange.toolRadius}`;
            pastToolList.appendChild(listItem);
        });
    }
});