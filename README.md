# Run-Time Data Visualization for Business Processes
## Overview
This  implements a real-time visualization system for sensor data streams in a manufacturing scenario, specifically focusing on axes power consumption during the production of chess pieces (rooks) using a milling machine. The data originates from simulated runs in the CPEE.
## Getting started
1. Clone the repository into your directory on the lehre.bpm.in.tum.de server
2. Install the required packages using 
    ```
    npm install modules
    ```
3. Start the server with
    ```
    node server.js
    ```
4. Go to: https://cpee.org/hub/server/Teaching.dir/Prak.dir/TUM-Prak-24-WS.dir/Machining%20V2.xml/open?stage=development and click run under the Execution tab.

- Optional: If you want to compare the main instance to another one (not possible in combined.html for visibility reasons) go to: https://cpee.org/hub/server/Teaching.dir/Prak.dir/TUM-Prak-24-WS.dir/Machining%20V2%20Alternative.xml/open?stage=development and click on run under the Execution tab.
5. Go to: https://lehre.bpm.in.tum.de/[your_directory]/[your_project_folder]/index.html 
6. Click on the graph you want to see.
7. In the url after 'shift=' enter the tool shift in milliseconds you want to configure. Values around 8291084 are recommended. This will shift the timestamps of the Tools in the instance back so they are closer to the data points of the MaxxTurm45/Axes/Power/Active/[...] and can be displayed together in the graphs.
8. In the url after 'instance=' enter the instance you have started in the CPEE
- Optional: In the url after 'compareto=' enter the other instance you have started in the CPEE. If you decide to not compare instances anymore after already having entered an instance after "compareto=" replace that instance with 0 to force clear. This is not possible for the combined.html for visibility reasons.
9. Done! There might be a waiting time of several minutes depending on the data provider. You can go back to the overview anytime and click on other graphs. The selected instance(s) and tool shift are saved via SessionStorage. The already emitted data is also persisted.