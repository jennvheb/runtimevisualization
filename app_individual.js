// create SSE connections to the SSE streams for a specific instance; do the same for the comparison if a non-empty string
const eventSourceInstance = new EventSource(`//lehre.bpm.in.tum.de/ports/6333/sse?instance=${instance}`);
const eventSourceCompareTo = (compareto && compareto.trim() !== '') ? new EventSource(`//lehre.bpm.in.tum.de/ports/6333/sse?instance=${compareto}`)  : 'nocomp';

const eventData = []; // storage for data points
const eventDataCompareTo = [];
let toolChangeTimestamps = []; // storage for tool changes in the visualization
let toolChangeTimestampsCompareTo = [];
let pastToolChanges = []; // storage for past tool info
let pastToolChangesCompareTo = [];

GR.ready(function() {
    var grInstance = new GR("gr-canvas");
    grInstance.setcolorrep(1000, 0.0, 0.39, 0.0); // define color index as dark green (stanard color index numbers do not work for gr)

    function updatePlot() {
        grInstance.clearws(); // clear previous drawing
        grInstance.setviewport(0.2, 0.9, 0.1, 0.95); // set size of the graph viewport
        grInstance.setcharheight(0.014); // set character size for text

        // extract timestamps and values from data
        let allTimesInstance = eventData.map(d => d.timestamp);
        let allValuesInstance = eventData.map(d => d.value);
        let allTimesCompareTo = eventDataCompareTo.map(d => d.timestamp);
        let allValuesCompareTo = eventDataCompareTo.map(d => d.value);

        if (allTimesInstance.length === 0 && (!compareto || allTimesCompareTo.length === 0)) return;

        // dyanmically setting the max & min values for the x/y axis based on the current data
        let xmin = Math.min(...allTimesInstance, ...(compareto ? allTimesCompareTo : []));
        let xmax = Math.max(...allTimesInstance, ...(compareto ? allTimesCompareTo : []));
        let ymin = Math.min(...allValuesInstance, ...(compareto ? allValuesCompareTo : []));
        let ymax = Math.max(...allValuesInstance, ...(compareto ? allValuesCompareTo : []));

        // add padding so the plotted data points don't go to the chart edge
        let yPadding = (ymax - ymin) * 0.1;
        ymin -= yPadding;
        ymax += yPadding;

        // dynamically set the number of ticks
        let tickX = (xmax - xmin) / 5;
        let tickY = (ymax - ymin) / 5;

        // set drawing area, colour of the graph, grids and axes lines
        grInstance.setwindow(xmin, xmax, ymin, ymax);
        grInstance.setlinecolorind(1);
        grInstance.grid(tickX, tickY, xmin, ymin, 1, 1);
        // grInstance.axes(tickX, tickY, xmin, ymin, 0, 1, 0.005);
        grInstance.axes(tickX, tickY, xmin, ymin, 1, 1, 0.005);

        grInstance.setlinecolorind(8); // set colour Blue for main instance
        grInstance.polyline(eventData.length, allTimesInstance, allValuesInstance); // plot the main data instance

        if (compareto) { // do the same for compareTo instance if it exists
            grInstance.setlinecolorind(1000); // set colour Dark Green for compareTo instance
            grInstance.polyline(eventDataCompareTo.length, allTimesCompareTo, allValuesCompareTo);
        }

        drawToolChangeLines(toolChangeTimestamps, xmin, xmax, ymin, ymax, 5); // draw the vertical line signifying a tool change for the main instance (colour: light blue)
        if (compareto) { // do the same for compareTo instance if it exists
            drawToolChangeLines(toolChangeTimestampsCompareTo, xmin, xmax, ymin, ymax, 3); // Light Green
        }

        /*
        // custom tick labels as gr does not support
        let tickTimes = Array.from({ length: 5 }, (_, i) => xmin + i * tickX);
        tickTimes.forEach(time => {
            let timeLabel = time.toFixed(3)

            let [xPos, yPos] = grInstance.wctondc(time, ymin);
            yPos = 0.05;
            grInstance.textext(xPos, yPos, timeLabel);

        }); */

        grInstance.settextcolorind(1);
        grInstance.textext(0.5, 0.01, "time (s)");
        grInstance.textext(0.001, 0.5, "power (w)");
    }

    // loop over timestamps to draw vertical lines of the tool changes
    function drawToolChangeLines(toolChangeTimestamps, xmin, xmax, ymin, ymax, colorIndex) {
        grInstance.setlinecolorind(colorIndex);
        toolChangeTimestamps.forEach(toolChangeTime => {
            if (toolChangeTime >= xmin && toolChangeTime <= xmax) {
                let xLine = [toolChangeTime, toolChangeTime];
                let yLine = [ymin, ymax];
                grInstance.polyline(2, xLine, yLine);
            }
        });
    }

    eventSourceInstance.onmessage = function(event) {
        const message = JSON.parse(event.data);

        // add data point and update plot if event matches sensor name set in the html
        if (message.id === eventName) {
            eventData.push({ timestamp: message.timestamp, value: parseFloat(message.value) });
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

            // add the shift to the timestamp and store in tool change if its new
            let shiftedTimestamp = parseFloat(message.timestamp) - (parseFloat(shift) / 1000);
            if (!toolChangeTimestamps.includes(shiftedTimestamp)) {
                toolChangeTimestamps.push(shiftedTimestamp);
                updatePlot();
            }
        } else if (message.id === "State/actToolIdentPast") {
            let shiftedTimestamp = parseFloat(message.timestamp) - (parseFloat(shift) / 1000);
            // if message contains past tool change add the entry and update the ui
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

    // helper function to update past tool changes in the ui
    function updatePastToolList() {
        let pastToolList = document.getElementById("pastToolList");
        pastToolList.innerHTML = "";

        pastToolChanges.forEach(toolChange => {
            let listItem = document.createElement("li");
            listItem.innerHTML = `ID: <strong>${toolChange.tool}</strong> - 
                                <span>${toolChange.timestamp.toFixed(3)}s</span><br>
                                TNumber: ${toolChange.tNumber}, 
                                Length: ${toolChange.toolLength1}, 
                                Radius: ${toolChange.toolRadius}`;
            pastToolList.appendChild(listItem);
        });
    }

    // same as above just for compareTo instance if set
    if (eventSourceCompareTo !== 'nocomp') {
        eventSourceCompareTo.onmessage = function(event) {
            const message = JSON.parse(event.data);

            if (message.id === eventName) {
                eventDataCompareTo.push({ timestamp: message.timestamp, value: parseFloat(message.value) });
                updatePlot();
            } else if (message.id === "State/actToolIdent") {
                document.getElementById("actToolIdentCompareTo").textContent = message.tool;

                if (message.tNumber !== undefined) {
                    document.getElementById("actTNumberCompareTo").textContent = message.tNumber;
                }
                if (message.toolLength1 !== undefined) {
                    document.getElementById("actToolLength1CompareTo").textContent = message.toolLength1;
                }
                if (message.toolRadius !== undefined) {
                    document.getElementById("actToolRadiusCompareTo").textContent = message.toolRadius;
                }

                let shiftedTimestamp = parseFloat(message.timestamp) - (parseFloat(shift) / 1000);
                if (!toolChangeTimestampsCompareTo.includes(shiftedTimestamp)) {
                    toolChangeTimestampsCompareTo.push(shiftedTimestamp);
                    updatePlot();
                }
            } else if (message.id === "State/actToolIdentPast") {
                let shiftedTimestamp = parseFloat(message.timestamp) - (parseFloat(shift) / 1000);
                if (!pastToolChangesCompareTo.some(tc => tc.timestamp === shiftedTimestamp)) {
                    pastToolChangesCompareTo.unshift({ tool: message.tool,
                        timestamp: shiftedTimestamp,
                        tNumber: message.tNumber || "N/A",
                        toolLength1: message.toolLength1 || "N/A",
                        toolRadius: message.toolRadius || "N/A" });
                    updatePastToolListCompareTo();
                }
            }
            else if (message.id === "State/actTNumber") {
                document.getElementById("actTNumberCompareTo").textContent = message.value;
            }
            else if (message.id === "State/actToolLength1") {
                document.getElementById("actToolLength1CompareTo").textContent = message.value;
            }
            else if (message.id === "State/actToolRadius") {
                document.getElementById("actToolRadiusCompareTo").textContent = message.value;
            }

        };
        function updatePastToolListCompareTo() {
            let pastToolList = document.getElementById("pastToolListCompareTo");
            pastToolList.innerHTML = "";

            pastToolChangesCompareTo.forEach(toolChange => {
                let listItem = document.createElement("li");
                listItem.innerHTML = `ID: <strong>${toolChange.tool}</strong> - 
                    <span>${toolChange.timestamp.toFixed(3)}s</span><br>
                    TNumber: ${toolChange.tNumber}, 
                    Length: ${toolChange.toolLength1}, 
                    Radius: ${toolChange.toolRadius}`;
                pastToolList.appendChild(listItem);
            });
        }
    }

});