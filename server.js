const express = require('express');
const multer = require('multer');
const EventEmitter = require('events');
const app = express();
const HTTP_PORT = 6333; // server listens on this port number for data
const url = require('url'); // for SSE instance selection

// using multer to store data in memory for faster processing and to be able to read multipart/form-data sent from the server
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const eventEmitter = new EventEmitter();
const serverSessionId = Date.now().toString();
const instanceData = {}; // store data per instance

// accepts all multipart uploads
app.post('/', upload.any(), (req, res) => {
    const receiveTime = Date.now();
    console.log(`[POST] Received at ${new Date(receiveTime).toISOString()}`); // for debug purposes, checking how fast data arrives
    if (req.body.notification) {
        const jsonData = JSON.parse(req.body.notification); // parse JSON payload in the notification field

        if (jsonData.instance) {
            console.log(`[DEBUG] POST instance: ${jsonData.instance}, has datastream: ${!!jsonData.datastream}`); // for debug purposes, checking if arrived data can be used
            const instance = jsonData.instance.toString();

            if (!instanceData[instance]) { // initialize instance storage if not already present
                instanceData[instance] = { toolChanges: [], pastToolChanges: {}, firstTimestamp: null, latestToolState: {}, pendingToolChange: null };
            }
            if (jsonData.datastream && Array.isArray(jsonData.datastream)) { // if JSON payload contains a datastream, loop over each data point
                console.log('[DEBUG] datastream contents:', JSON.stringify(jsonData.datastream));
                jsonData.datastream.forEach(entry => {
                    if (entry["stream:point"]) {
                        const dataPoint = entry["stream:point"];
                        const id = dataPoint["stream:id"];
                        const value = dataPoint["stream:value"];
                        const timestamp = new Date(dataPoint["stream:timestamp"]).getTime() / 1000; // get seconds

                        let relativeTimestamp = null;

                        // if stream is related to MaxxTurn45/Axes/Power/Active/, calculate relative time from first data point for MaxxTurn45
                        if (id.startsWith('MaxxTurn45/Axes/Power/Active/')) {
                            if (!instanceData[instance].firstTimestamp) {
                                instanceData[instance].firstTimestamp = timestamp;
                            }

                            relativeTimestamp = timestamp - instanceData[instance].firstTimestamp;

                            if (!instanceData[instance][id]) {
                                instanceData[instance][id] = [];
                            }
                            // store, and emit the data as a real-time event for clients listening
                            instanceData[instance][id].push({timestamp: relativeTimestamp, value});
                            eventEmitter.emit(`new-data-${instance}`, { id, timestamp: relativeTimestamp, value });
                        }

                        // handle tool information
                        if (id.startsWith('State/')) {

                            // handle tool change
                            if (id === "State/actToolIdent") {

                                // calculate timestamp seperately as tool timestamps are at a different time than the datapoints
                                let relativeTimestamp = instanceData[instance].firstTimestamp
                                    ? timestamp - instanceData[instance].firstTimestamp
                                    : 0;

                                // temporarily save tool ID and timestamp as other tool info comes in later
                                instanceData[instance].pendingToolChange = {
                                    tool: value,
                                    timestamp: relativeTimestamp
                                };

                                // emit current tool (change) to clients to draw the line and update the ui immediately
                                eventEmitter.emit(`new-data-${instance}`, {
                                    id: "State/actToolIdent",
                                    tool: value,
                                    timestamp: relativeTimestamp
                                });
                            } else {

                                // save incoming tool info and emit immediately
                                if (id === "State/actTNumber") {
                                    instanceData[instance].latestToolState.actTNumber = value;
                                    eventEmitter.emit(`new-data-${instance}`, {
                                        id: "State/actTNumber",
                                        value: value
                                    });
                                } else if (id === "State/actToolLength1") {
                                    instanceData[instance].latestToolState.actToolLength1 = value;
                                    eventEmitter.emit(`new-data-${instance}`, {
                                        id: "State/actToolLength1",
                                        value: value
                                    });
                                } else if (id === "State/actToolRadius") {
                                    instanceData[instance].latestToolState.actToolRadius = value;
                                    eventEmitter.emit(`new-data-${instance}`, {
                                        id: "State/actToolRadius",
                                        value: value
                                    });

                                    // checks if there is an incomplete tool change to finalize the tool change when all tool info arrived
                                    if (instanceData[instance].pendingToolChange) {
                                        // get tool id and timestamp saved earlier and attach latest tool info
                                        const pending = instanceData[instance].pendingToolChange;
                                        pending.tNumber = instanceData[instance].latestToolState.actTNumber || null;
                                        pending.toolLength1 = instanceData[instance].latestToolState.actToolLength1 || null;
                                        pending.toolRadius = instanceData[instance].latestToolState.actToolRadius || null;

                                        const lastToolChange = instanceData[instance].toolChanges.at(-1); // get last saved tool change

                                        if (lastToolChange) {
                                            if (!instanceData[instance].pastToolChanges[lastToolChange.tool]) {
                                                instanceData[instance].pastToolChanges[lastToolChange.tool] = [];
                                            }
                                            // save the last tool change in the history
                                            instanceData[instance].pastToolChanges[lastToolChange.tool].push(lastToolChange);

                                            // emit the past tool to the client
                                            eventEmitter.emit(`new-data-${instance}`, {
                                                id: "State/actToolIdentPast",
                                                tool: lastToolChange.tool,
                                                timestamp: lastToolChange.timestamp,
                                                tNumber: lastToolChange.tNumber,
                                                toolLength1: lastToolChange.toolLength1,
                                                toolRadius: lastToolChange.toolRadius
                                            });
                                        }

                                        // save the new tool change
                                        instanceData[instance].toolChanges.push(pending);
                                        // reset the pending tool change to avoid saving the same id when only the tool info changed
                                        instanceData[instance].pendingToolChange = null;

                                    }
                                }
                            }
                        }
                    }
                });
            }
        }
    }
    res.status(200).send('Data received and processed');
});

// push data to clients
app.get('/sse', (req, res) => {
    console.log("Incoming SSE Request for Instance:", req.query.instance);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const instance = url.parse(req.url, true).query.instance;

    // send session id and instance id for information purposes
    res.write(`data: ${JSON.stringify({ sessionId: serverSessionId, instance })}\n\n`);

    // function to send JSON data
    const sendEvent = data => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // replay existing data so clients get full history when they (re-)connect
    if (instanceData[instance]) {
        // replay data points
        Object.keys(instanceData[instance]).forEach(id => {
            if (id !== "toolChanges" && id !== "pastToolChanges" && id !== "firstTimestamp" && Array.isArray(instanceData[instance][id])) {
                instanceData[instance][id].forEach(dataPoint => sendEvent({ id, ...dataPoint }));
            }
        });

        // replay current tool changes for vertical lines in graph and current tool info
        if (instanceData[instance]["toolChanges"] && instanceData[instance]["toolChanges"].length > 0) {
            instanceData[instance]["toolChanges"].forEach(toolChange => {
                sendEvent({
                    id: "State/actToolIdent",
                    tool: toolChange.tool,
                    timestamp: toolChange.timestamp,
                    tNumber: toolChange.tNumber || null,
                    toolLength1: toolChange.toolLength1 || null,
                    toolRadius: toolChange.toolRadius || null
                });
            });
        }

        // replay past tool history
        if (instanceData[instance]["pastToolChanges"] && Object.keys(instanceData[instance]["pastToolChanges"]).length > 0) {
            Object.entries(instanceData[instance]["pastToolChanges"]).forEach(([tool, timestamps]) => {
                if (Array.isArray(timestamps)) {
                    timestamps.forEach(timestamp => {
                        sendEvent({
                            id: "State/actToolIdentPast",
                            tool,
                            timestamp: timestamp.timestamp || timestamp,
                            tNumber: timestamp.tNumber || null,
                            toolLength1: timestamp.toolLength1 || null,
                            toolRadius: timestamp.toolRadius || null
                        });
                    });
                }
            });
        }
    }

    // send initial state of tool info (for when the id didn't change but the info did)
    if (instanceData[instance] && instanceData[instance].latestToolState) {
        const latest = instanceData[instance].latestToolState;
        if (latest.actTNumber) {
            sendEvent({ id: "State/actTNumber", value: latest.actTNumber });
        }
        if (latest.actToolLength1) {
            sendEvent({ id: "State/actToolLength1", value: latest.actToolLength1 });
        }
        if (latest.actToolRadius) {
            sendEvent({ id: "State/actToolRadius", value: latest.actToolRadius });
        }
    }

    // register to send events in real time as soon as new data arrives
    eventEmitter.on(`new-data-${instance}`, sendEvent);

    // clean up when client disconnects
    req.on('close', () => {
        eventEmitter.removeListener(`new-data-${instance}`, sendEvent);
        res.end();
    });
});

app.listen(HTTP_PORT, () => {
    console.log(`Server listening on http://lehre.bpm.in.tum.de/:${HTTP_PORT}`);
});