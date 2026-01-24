/**
 * models.js
 * Contains the core data structures for the Event Placer application.
 * Mirrors the Python classes in classroomArrangement.py
 */

// Helper: Extract Department from Event Code (e.g. "AAC 100 01" -> "AAC")
function getDept(eventCode) {
    const match = String(eventCode).match(/[A-Z]+/);
    return match ? match[0] : "";
}

// Helper: Convert "HH:MM" string to minutes from midnight
function timeToMinutes(timeStr) {
    if (!timeStr) return 0;
    const parts = timeStr.split(":");
    return parseInt(parts[0]) * 60 + parseInt(parts[1]);
}

// Helper: Convert minutes from midnight to "HH:MM"
function minutesToTime(minutes) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}:${m < 10 ? '0' : ''}${m}`;
}

/**
 * Represents a single Course/Event to be scheduled.
 */
class Event {
    constructor(data) {
        // Handle different CSV header variations (Course vs Event file)
        this.eventCode = data.crs_cde || data.event_cde;
        this.name = data.crs_title || data.event_title;
        this.seats = parseInt(data.crs_enrollment || data.event_enrollment || 0);
        this.capacity = parseInt(data.crs_capacity || data.event_capacity || 0);
        this.maxCapacity = parseInt(data.max_enrollment || 0);

        // Time handling
        const beginStr = data.begin_tim || data.begin_time;
        const endStr = data.end_tim || data.end_time;

        // Days handling
        // in CSV: monday_cde, tuesday_cde ...
        // We need to construct a list of days: ['M', 'T', 'W', 'R', 'F']
        this.days = [];
        if (data.monday_cde) this.days.push(data.monday_cde);
        if (data.tuesday_cde) this.days.push(data.tuesday_cde);
        if (data.wednesday_cde) this.days.push(data.wednesday_cde);
        if (data.thursday_cde) this.days.push(data.thursday_cde);
        if (data.friday_cde) this.days.push(data.friday_cde);
        if (data.saturday_cde) this.days.push(data.saturday_cde);

        this.timeObj = new Time(beginStr, endStr, this.days);

        // Location Info
        const bldg = data.bldg_cde || "";
        const room = data.room_cde || "";
        this.pastLocationString = `${bldg} ${room}`;
        this.bldgCode = String(bldg);
        this.roomNumber = String(room);

        this.__historicalLocations = [this.pastLocationString];

        // Scheduling State
        this.indices = []; // Where it is placed in the schedule array
        this.placedLocation = ""; // The name of the room it was placed in
        this.metric = 0; // Performance metric (1=Best, 4=Worst)
        this.dept = getDept(this.eventCode);
    }

    getHistoricalLocations() {
        return this.__historicalLocations;
    }

    updateIndices(newIndices) {
        if (this.indices.length !== 0) return false;
        this.indices = newIndices;
        return true;
    }

    // Reset state for a new schedule generation run
    reset() {
        this.indices = [];
        this.placedLocation = "";
        this.metric = 0;
    }
}

/**
 * Represents a Physical Room/Location.
 */
class Location {
    constructor(data) {
        this.name = data.Location; // "BLDG ROOM"
        this.capacity = parseInt(data.Capacity || 0);
        this.features = data.Features ? data.Features.split("/") : [];

        // "BLDG ROOM" -> "BLDG"
        this.building = this.name.split(" ")[0];
    }
}

/**
 * Represents a Time Block.
 */
class Time {
    constructor(beginTime, endTime, days) {
        this.beginTime = beginTime; // String "HH:MM"
        this.endTime = endTime;     // String "HH:MM"
        this.days = days.filter(d => d); // Remove partials/nulls

        this.startMin = timeToMinutes(beginTime);
        this.endMin = timeToMinutes(endTime);

        this.totalTime = `${beginTime} - ${endTime}`;
    }
}
