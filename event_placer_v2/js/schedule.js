/**
 * schedule.js
 * Contains the logic for the scheduling algorithm.
 * Ports the Schedule class from classroomArrangement.py
 */

// Simple seeded Random Number Generator (Linear Congruential Generator)
// to replicate existing Python behavior of reproducible schedules.
class Random {
    constructor(seed) {
        this.m = 0x80000000;
        this.a = 1103515245;
        this.c = 12345;
        this.state = seed ? seed : Math.floor(Math.random() * (this.m - 1));
    }

    nextInt() {
        this.state = (this.a * this.state + this.c) % this.m;
        return this.state;
    }

    nextFloat() {
        // returns in range [0, 1]
        return this.nextInt() / (this.m - 1);
    }

    // Shuffle array in place
    shuffle(array) {
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(this.nextFloat() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        return array;
    }
}

class Schedule {
    constructor(locations, startTimeStr, endTimeStr, activeDays, interval, timeGapStr) {
        this.locations = locations; // Array of Location objects
        this.interval = parseInt(interval); // e.g. 10 mins
        this.timeGap = parseInt(timeGapStr); // e.g. 10 mins

        // Schedule Time Bounds
        this.schStartMin = timeToMinutes(startTimeStr + ":00");
        this.schEndMin = timeToMinutes(endTimeStr + ":00");
        this.activeDays = activeDays; // e.g. ['Monday', 'Tuesday'...] (Full names in JS UI)

        // Map Full day names to Single chars for compatibility
        this.dayMap = {
            'Sunday': 'Su', 'Monday': 'M', 'Tuesday': 'T', 'Wednesday': 'W',
            'Thursday': 'R', 'Friday': 'F', 'Saturday': 'Sa'
        };
        this.shortDays = this.activeDays.map(d => this.dayMap[d]);

        // Calculate Array Sizes
        // Intervals per day = (Total Minutes in Day) / Interval
        this.dayIntervals = Math.floor((this.schEndMin - this.schStartMin) / this.interval);
        this.weekIntervals = this.dayIntervals * this.shortDays.length;

        // Day Offset Map
        // M -> 0, T -> 1 * dayIntervals, etc.
        this.dayOffsets = {};
        this.shortDays.forEach((day, index) => {
            this.dayOffsets[day] = index * this.dayIntervals;
        });

        // The Schedule Grid: { "LocationName": [val, val, val...] }
        // 0 = empty, EventObj = occupied
        this.scheduleGrid = {};
        this.locations.forEach(loc => {
            this.scheduleGrid[loc.name] = new Array(this.weekIntervals).fill(0);
        });

        this.locationPreferences = {}; // {Dept: [Bldg, Bldg]}
        this.metrics = [0, 0, 0, 0]; // [Desired, SameBldg, PrefBldg, Wrong/Other]

        this.unscheduledCount = 0;
        this.arrangedCount = 0;
        this.arrangedLocations = [];
    }

    // Set Preferences from JSON
    setLocationPreferences(prefObj) {
        this.locationPreferences = prefObj || {};
    }

    // Helper: Convert Event Time -> Array of [StartIdx, EndIdx] ranges
    getIndicesForEvent(eventTimeObj) {
        const result = [];
        const durationMin = eventTimeObj.endMin - eventTimeObj.startMin;
        const slotsNeeded = Math.ceil(durationMin / this.interval);

        // For each day this event occurs
        eventTimeObj.days.forEach(day => {
            if (this.dayOffsets.hasOwnProperty(day)) {
                // Determine offset from schedule start time
                // e.g. SchStart 8:00, EventStart 9:00 -> 60 mins offset
                const timeOffsetMin = eventTimeObj.startMin - this.schStartMin;

                // If event starts before schedule starts, fail safely
                if (timeOffsetMin < 0) return;

                const startSlotInfo = Math.floor(timeOffsetMin / this.interval);
                const startIdx = this.dayOffsets[day] + startSlotInfo;
                const endIdx = startIdx + slotsNeeded;

                // Check bounds
                if (endIdx <= (this.dayOffsets[day] + this.dayIntervals)) {
                    result.push([startIdx, endIdx]);
                }
            }
        });
        return result;
    }

    checkTimeGap(locationArr, start, end) {
        if (this.timeGap === 0) return false;

        const gapSlots = Math.ceil(this.timeGap / this.interval);

        // check before
        for (let i = 1; i <= gapSlots; i++) {
            if (start - i >= 0 && locationArr[start - i] !== 0) return true; // Collision
        }
        // check after
        for (let i = 0; i < gapSlots; i++) {
            if (end + i < locationArr.length && locationArr[end + i] !== 0) return true;
        }
        return false;
    }

    placeEvent(event, location, force = false) {
        // Bounds check handled in getIndices mostly, but check total range
        if (event.timeObj.startMin < this.schStartMin || event.timeObj.endMin > this.schEndMin) {
            return false;
        }

        const ranges = this.getIndicesForEvent(event.timeObj);
        event.updateIndices(ranges);

        if (ranges.length === 0) return false; // Event not within schedule days/times

        const locName = location.name;
        const grid = this.scheduleGrid[locName];

        if (!force) {
            // Capacity Check
            if (event.seats > location.capacity) {
                event.indices = [];
                return false;
            }

            // Collision & Gap Check
            for (let [start, end] of ranges) {
                // Gap Check
                if (start !== 0 && this.checkTimeGap(grid, start, end)) {
                    event.indices = [];
                    return false;
                }

                // Overlap Check
                for (let k = start; k < end; k++) {
                    if (grid[k] !== 0) {
                        event.indices = [];
                        return false;
                    }
                }
            }
        }

        // Place it
        for (let [start, end] of ranges) {
            for (let k = start; k < end; k++) {
                grid[k] = event;
            }
        }
        event.placedLocation = locName;
        return true;
    }

    // Main Algorithm
    createSchedule(events, seed) {
        const rng = new Random(seed);
        let failures = 0;
        let waitingList = [];
        let finalList = [];
        let unscheduled = [];

        // Reset all events
        events.forEach(e => e.reset());
        rng.shuffle(events);

        // Helper: Find Loc by Name
        const findLoc = (name) => {
            // Handle "BLDG 00" vs "BLDG 0" inconsistencies
            let cleanName = name;
            const parts = name.split(" ");
            if (parts[1] === "00" || parts[1] === "000") cleanName = parts[0] + " 0";
            return this.locations.find(l => l.name === cleanName);
        };

        // Helper: Find Locs by Building
        const findLocsByBldg = (bldg) => {
            return this.locations.filter(l => l.name.startsWith(bldg));
        }

        // Phase 1: Historical / Past Location
        for (let event of events) {
            const pastLocStr = event.getHistoricalLocations()[0];

            // Check for AR (Arranged) logic would go here, simplified for now

            if (event.bldgCode === "undefined" || event.bldgCode === "nan") {
                finalList.push(event);
                continue;
            }
            if (event.roomNumber === "undefined" || event.roomNumber === "nan") {
                waitingList.push(event);
                continue;
            }

            const loc = findLoc(pastLocStr);
            if (loc) {
                if (this.placeEvent(event, loc)) {
                    // Success
                } else {
                    failures++;
                    waitingList.push(event);
                }
            } else {
                failures++;
                waitingList.push(event);
            }
        }

        // Phase 2: Same Building
        rng.shuffle(waitingList);
        for (let event of waitingList) {
            const bldgLocs = findLocsByBldg(event.bldgCode);
            let placed = false;

            if (bldgLocs.length === 0) {
                finalList.push(event);
                continue;
            }

            for (let loc of bldgLocs) {
                if (this.placeEvent(event, loc)) {
                    placed = true;
                    // remove from finalList if it was added? (Logic check: waitingList items aren't in finalList yet)
                    break;
                }
            }
            if (!placed) {
                failures++;
                finalList.push(event);
            }
        }

        // Phase 3: Preferences & Others
        rng.shuffle(finalList);
        for (let event of finalList) {
            let potentialLocs = [];

            // Preferences
            if (this.locationPreferences[event.dept]) {
                const prefBldgs = this.locationPreferences[event.dept]; // Array of bldg codes
                prefBldgs.forEach(b => {
                    potentialLocs = potentialLocs.concat(findLocsByBldg(b));
                });
            }

            // Add all other rooms (diff of potential and all)
            const remaining = this.locations.filter(l => !potentialLocs.includes(l));
            potentialLocs = potentialLocs.concat(remaining);

            let placed = false;
            for (let loc of potentialLocs) {
                if (this.placeEvent(event, loc)) {
                    placed = true;
                    break;
                }
            }
            if (!placed) {
                failures++;
                unscheduled.push(event);
            }
        }

        // Phase 4: Unscheduled (Create Virtual Rooms)
        // Simplified: Just dumping them in a virtual room for now or leaving unplaced
        // In python it creates "UN X" rooms.
        while (unscheduled.length > 0) {
            this.addUnscheduledLocation();
            // Try to place as many as possible in this new room
            // Need to iterate copy to allow modification
            const currentBatch = [...unscheduled];
            const newLoc = this.locations[this.locations.length - 1];

            for (let event of currentBatch) {
                if (this.placeEvent(event, newLoc)) {
                    // Remove from unscheduled
                    unscheduled = unscheduled.filter(e => e !== event);
                }
            }
            // If we couldn't place any in the new void room (e.g. time conflict with itself??), break to avoid infinite loop
            // In Python it relied on placeAEvent returning true for new rooms.
            if (currentBatch.length === unscheduled.length) {
                console.warn("Could not place some events even in virtual rooms -> Time Conflict with self?");
                break;
            }
        }

        this.calculateMetrics(events);
        return { failures, events };
    }

    addUnscheduledLocation() {
        const name = `UN ${this.unscheduledCount}`;
        const loc = new Location({ Location: name, Capacity: 9999, Features: "Virtual" });
        this.locations.push(loc);
        this.scheduleGrid[name] = new Array(this.weekIntervals).fill(0);
        this.unscheduledCount++;
    }

    calculateMetrics(events) {
        // [Desired, SameBldg, PrefBldg, Wrong/Other]
        let desired = 0, same = 0, pref = 0, wrong = 0;

        events.forEach(e => {
            if (!e.placedLocation) return;

            const placedBldg = e.placedLocation.split(" ")[0];
            const placedRoom = e.placedLocation.split(" ")[1];

            // Logic mirroring Python's __getScheduleMetrics
            if (e.bldgCode === "nan" || !e.bldgCode) {
                desired++; e.metric = 1;
            } else if (e.bldgCode === placedBldg && e.roomNumber === placedRoom) {
                desired++; e.metric = 1;
            } else if (e.bldgCode === placedBldg && (e.roomNumber === "nan" || !e.roomNumber)) {
                desired++; e.metric = 1;
            } else if (e.bldgCode === placedBldg) {
                same++; e.metric = 2;
            } else if (this.locationPreferences[e.dept] && this.locationPreferences[e.dept].includes(placedBldg)) {
                pref++; e.metric = 3;
            } else {
                wrong++; e.metric = 4;
            }
        });
        this.metrics = [desired, same, pref, wrong];
    }

    // Prepare data for Plotly
    getPlotlyData() {
        // We need an array of objects: { x: [start, end], y: LocationName, ... }
        // Plotly Timeline (bar h) expects dates. We can fake dates or use linear numbers.
        // Python used px.timeline with real dates.
        // Here we can use 'bar' with 'base'.

        const traces = [];

        // We want a trace per metric type to color code them, or just one big trace with colors?
        // Python code used "color=show" (usually 'Code'). 
        // Let's create one entry per placed event slot.

        // Actually, to fully match the visuals, we want the X axis to be TIME.
        // We can map our 0..End indices back to HH:MM strings roughly.
        // But Plotly JS `type: bar, orientation: h` works best with numbers.

        // Group by Location for Y-axis

        const yLabels = [];
        const base = [];
        const xLength = [];
        const text = [];
        const hover = [];
        const colors = [];

        // Sort locations for consistent display
        const sortedLocs = this.locations.map(l => l.name).sort();

        sortedLocs.forEach(locName => {
            const grid = this.scheduleGrid[locName];
            if (!grid) return;

            // To reduce draw calls, we could merge adjacent slots of same event
            let currentEvent = null;
            let startIdx = -1;

            for (let i = 0; i <= grid.length; i++) {
                const val = (i < grid.length) ? grid[i] : null;

                if (val !== currentEvent) {
                    // State change
                    if (currentEvent !== 0 && currentEvent !== null) {
                        // Close segment
                        // Calculation:
                        // Start Time = schStartMin + (startIdx % dayIntervals) * interval
                        // Duration = (i - startIdx) * interval
                        // Day Offset is handled by the "Day lines" visual usually, but here 
                        // we can just plot them linearly on a very long X axis 
                        // OR (better) use Date objects on a dummy date (1970-01-01) 
                        // to show a 24h view... but wait, this is a WEEK view?
                        // Python used px.timeline with offsets.

                        // Let's stick to linear scale 0..Max
                        yLabels.push(locName);
                        base.push(startIdx * this.interval);
                        xLength.push((i - startIdx) * this.interval);
                        text.push(currentEvent.eventCode);
                        hover.push(`${currentEvent.name}<br>${currentEvent.placedLocation}`);

                        // Color based on metric? Or Dept? Python used 'Code' (unique color per course). 
                        // Doing unique colors in JS is hard without a palette gen.
                        // Let's use Metric colors: Green (1), Blue (2), Orange (3), Red (4)
                        if (currentEvent.metric === 1) colors.push('#2ecc71');
                        else if (currentEvent.metric === 2) colors.push('#3498db');
                        else if (currentEvent.metric === 3) colors.push('#f1c40f');
                        else colors.push('#e74c3c');
                    }
                    currentEvent = val;
                    startIdx = i;
                }
            }
        });

        return [{
            type: 'bar',
            orientation: 'h',
            y: yLabels,
            base: base,
            x: xLength,
            text: text,
            hovertext: hover,
            marker: {
                color: colors
            }
        }];
    }
}
