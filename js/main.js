// Wialon session
var sess = null;
// Translate function
var translate = null;
// units data
var unitsData = {};
// map
var map = null;
// Current user
var user = {
    nm: "",
    mu: 0,
    prp: {
        us_addr_fmt: "0_0_0"
    },
    locale: {
        wd: 1
    }
};
var period = 1;
var adds;
var requestTimestamp;
// Delay function used for dynamic filter
var delay = (function() {
    var timer;
    return function(callback, ms) {
        clearTimeout(timer);
        timer = setTimeout(callback, ms);
    };
})();

// {flags: addr_fmt[0], city_radius: addr_fmt[1], dist_from_unit: addr_fmt[2]}
// Init wialon event system and create map
function initEnv() {
    // load all unit in session
    var params = {
        spec: [{
            "type": "type",
            "data": "avl_unit",
            "flags": 0x411,
            "mode": 0
        }]
    };
    sess.execute("core/update_data_flags", params, function(data) {
        showUnits();
    });
    // register event listener
    sess.on("positionChanged", handleChange);
    sess.on("lastMessageChanged", handleChange);
    sess.on("itemChanged", handleChange);
}
// Show units in the table and on the map
function showUnits(){
    // get loaded 'avl_units's items
    var units = sess.getItems("avl_unit");
    // check if units found
    if (!units || !units.length){
        W.logger("Units not found");
        return;
    }
    // sort by name in ascending order
    units.sort(function(unit1, unit2) {
        var name1 = unit1.nm.toLowerCase();
        var name2 = unit2.nm.toLowerCase();
        if (name1 > name2) {
            return 1;
        } else {
            return -1;
        }
        return 0;
    });
    var bounds = [];
    for (var i = 0, data = null, unit = null, html = "", len = units.length; i < len; i++) {
        unit = units[i];
        data = getUnitData(unit.id);
        // check if map created and we can detect position of unit
        if (map && data.pos) {
            // add point to bounds
            bounds.push(data.pos);
            // construct data to store it and reuse
            unitsData[unit.id] = {
                marker: L.marker({
                    lat: data.pos[0],
                    lng: data.pos[1]
                }, {
                    icon: L.icon({
                        iconUrl: data.icon,
                        iconAnchor: [16, 16]
                    }),
                    // store unit ID in options
                    unitId: unit.id
                })
                .bindPopup(null, {
                    offset: L.point(0, -16),
                    closeButton: false,
                    className: "olMarkerLabel"
                })
                .addTo(map)
                .on("popupopen", function(e) {
                    var pos = e.target.getLatLng();
                    // get address format
                    var addr_fmt = user.prp.us_addr_fmt.split("_");
                    // use geocode
                    sess.getLocations({
                        coords: [{
                            lat: pos.lat,
                            lon: pos.lng
                        }],
                        flags: addr_fmt[0],
                        city_radius: addr_fmt[1],
                        dist_from_unit: addr_fmt[2]
                    }, false, function(id, data) {
                        $("#marker_tooltip_" + id).html($.isArray(data) ? data[0] : "-");
                    }.bind(this, e.target.options.unitId));
                })
                .on("mouseover", function(e) {
                    // update popup content
                    setPopupContent(e.target.options.unitId, function(marker) {
                        // open popup
                        marker.openPopup();
                    }.bind(this, e.target));
                })
                .on("mouseout", function(e) {
                    // hide popup
                    e.target.closePopup();
                }),
                tail: L.polyline([{
                    lat: data.pos[0],
                    lng: data.pos[1]
                }], {
                    color: getRandomColor(),
                    opacity: .8
                }).addTo(map),
                props: {
                    trip: {
                        avg_speed: 0,
                        distance: 0,
                        max_speed: 0
                    }
                },
                newer: true
            };
        }
        // Generate output table html
        html = "<tr id='unit_row_"+ unit.id +"' class='row-name' data-id='" + unit.id + "'>"
        + "<td class='centered' id='unit_img_" + unit.id + "'><img src='" + data.icon + "' width='24' height='24'/></td>"
        + "<td id='unit_name_" + unit.id + "' class='shorten-container'><div class='shorten'>" + data.name + "</div></td>"
        + "<td id='unit_time_" + unit.id + "'>" + data.tm + "</td>"
        + "<td id='unit_speed_" + unit.id + "'>" + data.speed + "</td>"
        + "</tr>";
        $("#units_tbl").append(html);
    }
}

// Position changed event handler
function handleChange(e) {
    // get unit from session
    var unit = sess.getItem(e.i);
    if (!unit) {
      return false;
    }
    // get event type
    var type = e.type;
    // get data from evt
    var changed = e.d;
    var data = getUnitData(unit.id);
    var marker = null;
    if (type === "itemChanged") {
        // changed name
        if (changed.nm) {
            $("#unit_name_" + unit.id +" div").html( data.name );
        }
        // changed icon
        if (changed.uri) {
            $("#unit_img_" + unit.id + " img").attr("src", data.icon);
            if (unit.id in unitsData) {
                marker = unitsData[unit.id].marker;
                marker.setIcon(L.icon({
                    iconUrl: data.icon,
                    iconAnchor: [16, 16]
                }));
            }
        }
    } else if (changed.pos && type === "positionChanged") {
        $("#unit_speed_" + unit.id).html(data.speed);
        if (unit.id in unitsData) {
            marker = unitsData[unit.id].marker;
            // move marker
            marker.setLatLng({lat: data.pos[0], lng: data.pos[1]});
            // add point to tail
            unitsData[unit.id].tail.addLatLng({lat: data.pos[0], lng: data.pos[1]});
            // remove oldest point if tail too long
            if (unitsData[unit.id].tail.getLatLngs().length > 10) {
                unitsData[unit.id].tail.spliceLatLngs(0, 1);
            }
            unitsData[unit.id].newer = true;
        }
    } else if (type === "lastMessageChanged") {
        $("#unit_time_" + unit.id).html(data.tm);
    }
}

// Search necessary unit
function onSearch() {
    // we'll wait 500ms and call search function
    delay(function() {
        // get all units list
        var units = sess.getItems("avl_unit");
        // get entered value
        var string = $("#units_filter").val();
        string = string.trim().toString().toLowerCase();
        units = units.filter(function(unit) {
            // Check if it is not null
            if (!unit) {
                return false;
            }
            if (!string.length || unit.nm.toString().toLowerCase().indexOf( string ) !== -1 ) {
                return false;
            }
            return true;
        }).map(function(unit) {
            return unit.id;
        });
        // show all units
        $("[id^='unit_row_']").show();
        // hide units in witch we can't find necessary string
        units.forEach(function(id) {
            $("#unit_row_" + id).hide();
        });
    }, 500);
}

// On search input change event
function onSearchChange(e) {
    // we'll call onSearch function when user click
    // "Esc" or "Backspace" button
    if ((e.which === 8) || (e.which === 27) || (e.keyCode === 8) || (e.keyCode === 27)) {
        onSearch();
    }
}

// Random color generator
function getRandomColor() {
    var letters = "0123456789ABCDEF".split("");
    var color = "#";
    for (var i = 0; i < 6; i++ ) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

// Set popup content for necessary unit
function setPopupContent(id, callback) {
    if (!id) {
        return false;
    }
    var data = getUnitData(id);
    if (!(id in unitsData)) {
        return false;
    }
    var marker = unitsData[id].marker;
    if (!marker) {
        return false;
    }
    var updateCallback = function(data, newer) {
        // check if we'll need to update current data
        if (newer) {
            var data = getUnitData(id);
        }
        var html = "";
        if (data.name) {
            html += "<div class='label-title'>" + data.name +"</div>";
        }
        html += "<table>";
        if (data.tm) {
            html += "<tr><td>" + translate("Last message") + ":&nbsp;</td><td>" + data.tm + "</td></tr>";
        }
        html += "<tr><td>" + translate("Location") + ": </td><td id='marker_tooltip_" + id + "'></td></tr>";
        if (data.speed) {
            html += "<tr><td>" + translate("Speed") + ": </td><td>" + data.speed + "</td></tr>";
        }
        html += "<tr><td>" + translate("Event") + ": </td><td>" + data.stateNamed + "</td></tr>";
        html += "<tr><td>" + translate("Start") + ": </td><td>" + data.start + "</td></tr>";
        html += "<tr><td>" + translate("Duration") + ": </td><td>" + data.duration + "</td></tr>";
        html += "<tr><td>" + translate("Distance") + ": </td><td>" + data.distance + "</td></tr>";
        html += "<tr><td>" + translate("Avg.speed") + ": </td><td>" + data.avg_speed + "</td></tr>";
        html += "<tr><td>" + translate("Max.speed") + ": </td><td>" + data.max_speed + "</td></tr>";
        html += "</table>";
        marker.getPopup().setContent(html).update();
        callback && callback();
    }.bind(this, data);
    if (unitsData[id].newer) {
        // Update data
        updateUnitData(id, updateCallback);
    } else {
        updateCallback();
    }
}

// Get necessary data from unit
function getUnitData(id) {
    // get unit from session
    var unit = sess.getItem(id);
    if (!unit) {
        return false;
    }
    var result = {
        id: id,
        name: unit.nm || "",
        icon: sess.getBaseUrl() + unit.uri + "?b=32",
        pos: null,
        speed: "-",
        mu: unit.mu || 0,
        tm: parceDate(unit.lmsg && unit.lmsg.t),
        cnm: unit.cnm || 0
    };
    if (unit.pos) {
        result.pos = [unit.pos.y, unit.pos.x];
        var converts = convertMeasure([{
            k: ["km/h", "mph"],
            v: unit.pos.s
        }], unit);
        result.speed = converts ? converts[0] : "-";
    }
    if (id in unitsData) {
        // merge properties
        $.extend(unitsData[id].props, unit);
        if ("trip" in unitsData[id].props) {
            $.extend(result, getTripInfo(unitsData[id].props.trip, unit));
        }
    }
    return result;
}

// Update unit data
function updateUnitData(id, callback) {
    if (!(id in unitsData)) {
        return false;
    }
    var params = {
        itemId: id,
        eventType: "trips",
        ivalType: 0,
        ivalFrom: 0,
        ivalTo: 0,
        filter2: "*"
    };
    // load all events
    sess.execute("unit/get_events", {params: params}, function(id, data) {
        if (!data || data.error || !("trips" in data)) {
            callback && callback();
            return false;
        }
        $.extend(unitsData[id].props.trip, data.trips);
        // Remove it from unit data
        delete unitsData[id].newer;
        callback && callback(unitsData[id]);
    }.bind(this, id));
}

// Pan to marker on map
// Get events data from unit
function getDetailedInfo(id) {
    removeAdds();
    if ((id === Object(id)) && ("id" in id.currentTarget)) {
        $("#units_tbl tr.active").removeClass("active");
        $(id.currentTarget).closest("tr").addClass("active");
        id = $(id.currentTarget).data("id");
    }
    if (!id) {
        return false;
    }
    // get unit from session
    var unit = sess.getItem(id);
    if (!unit) {
      return false;
    }
    if (map && unit.pos) {
        // Pan map to current unit
        map.panTo([unit.pos.y, unit.pos.x]);
    }
    var today = getToday();
    var interval;
    var from;
    var day1;
    var day2;
    switch (period) {
        // yesterday
        case 0:
            interval = [today - 86.4e3, today - 1];
            break;
        // week
        case 2:
            day1 = new Date(today * 1000);
            day2 = day1.getDay();
            var monday = day1.getDate() - day2 + (day2 === 0 ? -7 : 0) + (user.locale.wd === 1 ? 1 : 0);
            monday = new Date(day1.setDate(monday));
            from = new Date(monday.setDate(monday.getDate()));
            from = Math.floor(from.getTime() / 1000) | 0;
            interval = [from, today - 1];
            break;
        // month
        case 3:
            day1 = new Date(today * 1000);
            day2 = new Date(day1.setDate(1));
            from = new Date(day2);
            from = Math.floor(from.getTime() / 1000) | 0;
            interval = [from, today - 1];
            break;
        default:
            interval = [today, sess.getCurrentTime()];
    }
    var params = {
        itemId: id,
        eventType: "trips",
        ivalType: 1,
        ivalFrom: interval[0],
        ivalTo: interval[1]
    };
    requestTimestamp = sess.getCurrentTime();
    // load all events
    sess.execute("unit/get_events", {params: params}, function(ts, data) {
        if (ts !== requestTimestamp) {
            return false;
        }
        if (!data || data.error) {
            $("#events_tbl").html("<tr><td colspan='7' class='centered'>" + translate("No data") + "</td></tr>");
            return false;
        }
        // clear events view
        $("#events_tbl").empty();
        // generate trips
        generateTrips(data.trips, unit);
    }.bind(this, requestTimestamp));
    return false;
}

// Update period
function updatePeriod(e) {
    var btnPeriod = $(e.currentTarget).data("period");
    if (btnPeriod == null || (~~btnPeriod === period)) {
        return false;
    }
    $(e.currentTarget).addClass("active")
        .siblings().removeClass("active");
    // update current period
    period = ~~btnPeriod;
    // Try to find corrent unit
    var id = $(".row-name.active");
    if (!id.length) {
        return false;
    }
    id = $(id[0]).data('id');
    // Call detailed info
    getDetailedInfo(id);
    return false;
}

// Get detailed information about trip or smth else & draw it on map
function getDetailedEvent(e) {
    removeAdds();
    $("#events_tbl tr.active").removeClass("active");
    $(e.currentTarget).closest("tr").addClass("active");
    var id = $(e.currentTarget).data("id");
    var state = ~~$(e.currentTarget).data("state");
    // Skip if there are no necessary data attributes
    if (!map || !id) {
        return false;
    }
    if (state === 1) {
        var from = $(e.currentTarget).data("from");
        var to = $(e.currentTarget).data("to");
        if (!from || !to) {
            return false;
        }
        var params = {
            itemId: id,
            eventType: "trips",
            ivalType: 4,
            ivalFrom: from,
            ivalTo: to,
            detalization: 0x10
        };
        requestTimestamp = sess.getCurrentTime();
        // load all events
        sess.execute("unit/get_events", {params: params}, function(ts, data) {
            if (!data || data.error || !data.trips.length || !('msgs' in data.trips[0]) || (ts !== requestTimestamp)) {
                return false;
            }
            var latlngs = data.trips[0].msgs.map(function(p) {
                return {
                    lat: p.y,
                    lng: p.x
                };
            });
            var color = (id in unitsData) ? unitsData[id].tail.options.color : getRandomColor();
            // add track to map
            adds = L.polyline(latlngs, {color: color, opacity: .8}).addTo(map);
            // zoom the map to the polyline
            map.fitBounds(adds.getBounds());
        }.bind(this, requestTimestamp));
    } else {
        var lat = $(e.currentTarget).data("lat");
        var lng = $(e.currentTarget).data("lng");
        if (!lat || !lng) {
            return false;
        }
        // add track to map
        adds = L.marker({lat: lat, lng: lng}, {clickable: false}).addTo(map);
        // zoom the map to the polyline
        map.panTo(adds.getLatLng());
    }
    return false;
}

// Generate trips table
function generateTrips(trips, unit) {
    if (!trips || !trips.length || !unit) {
        $("#events_tbl").html("<tr><td colspan='7' class='centered'>" + translate("No data") + "</td></tr>");
        return false;
    }
    var html = "";
    var resultTrips = [];
    var len = trips.length;
    trips.forEach(function(trip, i) {
        // Insert parking here
        if (i) {
            var parking = {
                state: 0,
                distance: 0,
                avg_speed: 0,
                max_speed: 0
            };
            var prev = resultTrips[resultTrips.length - 1];
            parking.from = prev.to;
            parking.to = trip.from;
            // Insert to resulted array
            resultTrips.push(parking);
        }
        resultTrips.push(trip);
    });
    resultTrips.forEach(function(trip) {
        var result = getTripInfo(trip, unit);
        // Generate output table html
        html += "<tr id='unit_trip_row_"+ unit.id +"' class='row-name-trip' data-state='" + result.state + "' data-id='" + unit.id + "'";
        if (result.state === 1) {
            html += " data-from='" + trip.from.t + "' data-to='" + trip.to.t + "'";
        } else {
            html += " data-lat='" + trip.to.y + "' data-lng='" + trip.to.x + "'";
        }
        html += "><td id='unit_trip_type_" + unit.id + "' class='shorten-container'><div class='shorten'>" + result.stateNamed + "</div></td>"
        + "<td id='unit_trip_start_" + unit.id + "' class='shorten-container'><div class='shorten'>" + result.start + "</div></td>"
        + "<td id='unit_trip_time_" + unit.id + "'>" + result.duration + "</td>"
        + "<td id='unit_trip_distance_" + unit.id + "'>" + result.distance + "</td>"
        + "<td id='unit_trip_avg_speed_" + unit.id + "'>" + result.avg_speed + "</td>"
        + "<td id='unit_trip_max_speed_" + unit.id + "'>" + result.max_speed + "</td>"
        + "</tr>";
    });
    $("#events_tbl").append(html);
}

// Convert measuments
function convertMeasure(values, unit) {
    if (!unit || !$.isArray(values)) {
        return false;
    }
    var result = [];
    if (unit.mu) {
        values.forEach(function(value) {
            result.push(
                (!value || !('k' in value) || !('v' in value)) ?
                "-" :
                Math.ceil(~~value.v * 0.621 - 0.49) + "&nbsp;" + translate(value.k[1])
            );
        });
    } else {
        values.forEach(function(value) {
            result.push(
                (!value || !('k' in value) || !('v' in value)) ?
                "-" :
                ~~value.v + "&nbsp;" + translate(value.k[0])
            );
        });
    }
    return result;
}

// Get trip information
function getTripInfo(trip, unit) {
    if (!trip || !unit) {
        return false;
    }
    var measures = [];
    measures.push(("distance" in trip) ? {
        k: ["m", "mi"],
        v: trip.distance
    } : null);
    measures.push(("avg_speed" in trip) ? {
        k: ["km/h", "mph"],
        v: trip.avg_speed
    } : null);
    measures.push(("max_speed" in trip) ? {
        k: ["km/h", "mph"],
        v: trip.max_speed
    } : null);
    var converts = convertMeasure(measures, unit);
    var result = {};
    result.state = ~~trip.state;
    result.start = parceDate(("from" in trip) ? trip.from.t : 0);
    result.duration = parceUnixTime(("to" in trip && "from" in trip) ? (trip.to.t - trip.from.t) : 0);
    result.distance = converts ? converts[0] : "-";
    result.avg_speed = converts ? converts[1] : "-";
    result.max_speed = converts ? converts[2] : "-";
    switch (result.state) {
        case 2:
            result.stateNamed = translate("Stop");
        break;
        case 1:
            result.stateNamed = translate("Trip");
        break;
        default:
            result.stateNamed = translate("Parking");
    }
    return result;
}

// Fetch varable from 'GET' request
function getHtmlVar(name) {
    if (!name) {
        return null;
    }
    var pairs = decodeURIComponent(document.location.search.substr(1)).split("&");
    for (var i = 0; i < pairs.length; i++) {
        var pair = pairs[i].split("=");
        if (pair[0] == name) {
            pair.splice(0, 1);
            return pair.join("=");
        }
    }
    return null;
}

// Get today
function getToday() {
    var time = new Date().getTime() + (sess.getTimeZoneOffset() - W.Util.time.getTimeZoneOffset()) * 1000;
    time = new Date(time);
    time.setHours(0);
    time.setMinutes(0);
    time.setSeconds(0);
    time.setMilliseconds(0);
    time = Math.floor(time.getTime() / 1000) | 0;
    return time;
}

// Order events
function orderEvents() {
    $("#events_tbl tr").each(function() {
        $("#events_tbl").prepend(this);
    });
    return false;
}

// Parce unix-time
function parceUnixTime(time) {
    time = ~~time;
    if (!time) {
        return "-";
    }
    var result = "";
    if (Math.floor(time / 86.4e3)) {
        result += "&nbsp;"+ Math.floor(time / 86.4e3) + translate("d");
    }
    if (Math.floor(time / 36e2 % 24)) {
        result += "&nbsp;"+ Math.floor(time / 36e2 % 24) + translate("h");
    }
    if (Math.floor(time / 60 % 60)) {
        result += "&nbsp;"+ Math.floor(time / 60 % 60) + translate("m");
    }
    if (Math.floor(time % 60)) {
        result += "&nbsp;"+ Math.floor(time % 60) + translate("s");
    }
    return result = result.replace("&nbsp;", "");
}

// Parce date
function parceDate(time) {
    time = ~~time;
    if (!time) {
        return "-";
    }
    var date = new Date(sess.getUserTime(time, 0) * 1000);
    var result = date.getFullYear();
    result += "-" + ("0" + (date.getMonth() + 1)).slice(-2);
    result += "-" + ("0" + date.getDate()).slice(-2);
    result += "&nbsp;" + ("0" + date.getHours()).slice(-2);
    result += ":" + ("0" + date.getMinutes()).slice(-2);
    result += ":" + ("0" + date.getSeconds()).slice(-2);
    return result;
}

// Login result
function login(data) {
    W.logger("stringify", data);
    if (typeof data === "undefined" || typeof data !== "object" || data.error) {
        alert( translate("Login error") );
        return;
    }
    // column names
    $("#icon_col").html(translate("Icon"));
    $("#name_col").html(translate("Name"));
    $("#lmsg_col").html(translate("Last message"));
    $("#speed_col").html(translate("Speed"));
    $("#type_col").html(translate("Event"));
    $("#start_col").html(translate("Start"));
    $("#time_col").html(translate("Duration"));
    $("#distance_col").html(translate("Distance"));
    $("#avg_speed_col").html(translate("Avg.speed"));
    $("#max_speed_col").html(translate("Max.speed"));
    $("#btn-yesterday").html(translate("Yesterday"));
    $("#btn-today").html(translate("Today"));
    $("#btn-week").html(translate("Week"));
    $("#btn-month").html(translate("Month"));
    $("#events_descr").html(translate("Choose a unit"));
    $("#units_filter").attr("placeholder", translate("Search by name"));
    // Merge default user properties with current
    $.extend(user, sess.getCurrentUser());
    // show user name
    $("#user_name_id").html(user.nm);
    // create a map in the "map" div
    var gurtam = L.tileLayer.webGis(sess.getBaseGisUrl(), {
        attribution: "&copy; Gurtam Maps",
        minZoom: 4,
        userId: user.id
    });
    var osm = L.tileLayer("http://{s}.tile.osm.org/{z}/{x}/{y}.png", {
        attribution: "&copy; <a href='http://osm.org/copyright'>OpenStreetMap</a> contributors"
    });
    map = L.map("map_id", {layers: [gurtam]}).setView([52.32728615559, 9.798388481140], 14);
    L.control.layers({
        "Gurtam Maps": gurtam,
        "OpenStreetMap": osm
    }).addTo(map);
    // try to define user locale
    sess.execute("user/get_locale", {params: {userId: user.id}}, function(data) {
        if (data && ('wd' in data)) {
            $.extend(user.locale, data);
        }
        initEnv();
    });
    // Call window resize
    onResize();
}

// Init SDK
function initSdk() {
    W.logger(translate("initialize sdk"));
    var url = getHtmlVar("baseUrl") || getHtmlVar("hostUrl") || "https://hst-api.wialon.com";
    var authHash = getHtmlVar("authHash");
    var sid = getHtmlVar("sid");
    // Init wialon session
    sess = new W.Session(url, {eventsTimeout: 5});
    if (authHash) {
        sess.execute("core/use_auth_hash", {authHash: authHash}, login);
    } else if (sid) {
        var user = getHtmlVar("user") || "";
        sess.execute("core/duplicate", {operateAs: user, continueCurrentSession: true, sid: sid}, login);
    }
}

// Remove track or marker
function removeAdds() {
    // clear track or marker if needed
    if (map && (adds instanceof L.Polyline || adds instanceof L.Marker)) {
        map.removeLayer(adds);
    }
}

// We are ready now
function onLoad() {
    // load translations
    var lang = getHtmlVar("lang") || "en";
    if (["en", "ru"].indexOf(lang) == -1){
        lang = "en";
    }

    $.localise("lang/", {language: lang});
    translate = $.localise.tr;

    // Enable debug messages
    W.debug = false;

    // Try to initialize SDK
    initSdk();
}

// Resize window event
function onResize() {
    var units_container = $("#units_container");
    units_container.css("height", Math.floor(($(window).outerHeight(true) - $("#timepicker").outerHeight(true) - units_container.offset().top) * 2 / 3));
    $("#events_container").css("height", Math.floor(units_container.outerHeight(true) / 2));
}

$(document)
    .ready(onLoad)
    // center unit on map
    .on("click", ".row-name", getDetailedInfo)
    // draw trip on map
    .on("click", ".row-name-trip", getDetailedEvent)
    .on("click", ".timepicker td", updatePeriod)
    .on("click", ".order", orderEvents)
    // search unit
    .on("keypress", "#units_filter", onSearch)
    .on("keyup", "#units_filter", onSearchChange);
$(window).resize(onResize);