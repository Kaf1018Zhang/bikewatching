import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';


console.log("Mapbox GL JS Loaded:", mapboxgl);

mapboxgl.accessToken = 'pk.eyJ1IjoiaXJpcy1kZS1sYXBsYWNlIiwiYSI6ImNtN2s0bGFvNjBhaGQyanB2cHZqdGk2NHQifQ.XnEbKVpr8VeMdRRFLiur7g';

const map = new mapboxgl.Map({
    container: 'map', 
    style: 'mapbox://styles/mapbox/streets-v12', 
    center: [-71.09415, 42.36027], 
    zoom: 12, 
    minZoom: 5,
    maxZoom: 18
});

let trips = []; 
let stations = []; 
let radiusScale;
let circles; 
let stationFlow = d3.scaleQuantize()
    .domain([0, 1])
    .range([0, 0.5, 1]); 


map.on('load', async () => {
    console.log("Map fully loaded");

    const bikeLaneStyle = {
        'line-color': '#32D400', 
        'line-width': 5,       
        'line-opacity': 0.6    
    };

    map.addSource('boston_route', {
        type: 'geojson',
        data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson'
    });

    map.addLayer({
        id: 'bike-lanes-boston',
        type: 'line',
        source: 'boston_route',
        paint: bikeLaneStyle
    });

    console.log("Boston bike lanes added.");

    map.addSource('cambridge_route', {
        type: 'geojson',
        data: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson'
    });

    map.addLayer({
        id: 'bike-lanes-cambridge',
        type: 'line',
        source: 'cambridge_route',
        paint: {
            'line-color': '#0044FF', 
            'line-width': 5,
            'line-opacity': 0.6
        }
    });

    console.log("Cambridge bike lanes added.");

    map.addControl(new mapboxgl.NavigationControl(), 'top-right');
    map.addControl(new mapboxgl.FullscreenControl());

    map.addControl(new mapboxgl.GeolocateControl({
        positionOptions: {
            enableHighAccuracy: true
        },
        trackUserLocation: true
    }));

    console.log("Controls added.");

    try {
        const jsonurl = 'https://dsc106.com/labs/lab07/data/bluebikes-stations.json';
        const jsonData = await d3.json(jsonurl);
        console.log('Loaded JSON Data:', jsonData);

        stations = jsonData.data.stations;
        console.log('Stations Array:', stations);
        console.log("Sample station data:", stations[0]);

        const svg = d3.select('#map').select('svg');

        circles = svg.selectAll('circle')
            .data(stations)
            .enter()
            .append('circle')
            .attr('r', 5)             
            .attr('fill', 'steelblue')   
            .attr('stroke', 'white')    
            .attr('stroke-width', 1)    
            .attr('opacity', 0.8);     

        function updatePositions() {
            circles
                .attr('cx', d => getCoords(d).cx)
                .attr('cy', d => getCoords(d).cy);
        }

        updatePositions();
        map.on('move', updatePositions);    
        map.on('zoom', updatePositions);   
        map.on('resize', updatePositions); 
        map.on('moveend', updatePositions); 



        const trafficUrl = 'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv';
        trips = await d3.csv(trafficUrl, (trip) => {
            trip.started_at = new Date(trip.started_at);
            trip.ended_at = new Date(trip.ended_at);
            return trip;
        });


        console.log('Processed Trips Data:', trips);


        const departures = d3.rollup(
            trips,
            v => v.length,
            d => d.start_station_id
        );

        const arrivals = d3.rollup(
            trips,
            v => v.length,
            d => d.end_station_id
        );

        console.log("Departures Map:", departures);
        console.log("Arrivals Map:", arrivals);

        let filteredTrips = filterTripsByTime(trips, timeFilter);
        stations = computeStationTraffic(jsonData.data.stations, filteredTrips);

        console.log("Filtered Stations Data:", stations);


        console.log("Updated Stations with Traffic Data:", stations);

        radiusScale = d3.scaleSqrt()
        .domain([0, d3.max(stations, d => d.totalTraffic)]) 
        .range([0, 25]); 

        circles
        .attr('r', d => radiusScale(d.totalTraffic)) 
        .attr('fill', d => d.departures > d.arrivals ? "steelblue" : "darkorange");

        circles
        .style("--departure-ratio", d => stationFlow(d.departures / d.totalTraffic));


        console.log("Circles updated with scaled radii.");

        circles.each(function (d) {
            d3.select(this)
                .append('title') 
                .text(`Total Traffic: ${d.totalTraffic}\nDepartures: ${d.departures}\nArrivals: ${d.arrivals}`);
        });



    } catch (error) {
        console.error('Error loading JSON:', error);
    }

    const timeSlider = document.getElementById('time-slider');
    const selectedTime = document.getElementById('selected-time');
    const anyTimeLabel = document.getElementById('any-time');

    function updateTimeDisplay() {
        timeFilter = Number(timeSlider.value); 
    
        if (timeFilter === -1) {
            selectedTime.textContent = ''; 
            anyTimeLabel.style.display = 'block'; 
        } else {
            selectedTime.textContent = formatTime(timeFilter); 

            updateScatterPlot(timeFilter);

            anyTimeLabel.style.display = 'none';  
        }
    
       
    }
    
    timeSlider.addEventListener('input', updateTimeDisplay);
    updateTimeDisplay();
    


});

function getCoords(station) {
    const lon = parseFloat(station.Long) || parseFloat(station.lon); 
    const lat = parseFloat(station.Lat) || parseFloat(station.lat);

    if (isNaN(lon) || isNaN(lat)) {
        console.warn("Invalid coordinates for station:", station);
        return { cx: 0, cy: 0 }; 
    }

    const point = new mapboxgl.LngLat(lon, lat);
    const { x, y } = map.project(point);
    return { cx: x, cy: y };
}

let timeFilter = -1; 

function formatTime(minutes) {
    const date = new Date(0, 0, 0, 0, minutes);
    return date.toLocaleString('en-US', { timeStyle: 'short' }); 
}

function minutesSinceMidnight(date) {
    return date.getHours() * 60 + date.getMinutes();
}

function filterTripsByTime(trips, timeFilter) {
    return timeFilter === -1 
        ? trips 
        : trips.filter((trip) => {
           
            const startedMinutes = minutesSinceMidnight(trip.started_at);
            const endedMinutes = minutesSinceMidnight(trip.ended_at);


            return (
                Math.abs(startedMinutes - timeFilter) <= 60 ||
                Math.abs(endedMinutes - timeFilter) <= 60
            );
        });
}

function computeStationTraffic(stations, trips) {

    const departures = d3.rollup(
        trips,
        (v) => v.length,
        (d) => d.start_station_id
    );


    const arrivals = d3.rollup(
        trips,
        (v) => v.length,
        (d) => d.end_station_id
    );


    return stations.map((station) => {
        let id = station.short_name;
        station.arrivals = arrivals.get(id) ?? 0;
        station.departures = departures.get(id) ?? 0;
        station.totalTraffic = station.arrivals + station.departures;
        return station;
    });
}

function updateScatterPlot(timeFilter) {
  
    const filteredTrips = filterTripsByTime(trips, timeFilter);
    const filteredStations = computeStationTraffic(stations, filteredTrips);


    if (timeFilter === -1) {
        radiusScale.range([0, 25]); 
    } else {
        radiusScale.range([3, 50]); 
    }

    circles
        .data(filteredStations, (d) => d.short_name)
        .join('circle')
        .attr('r', (d) => radiusScale(d.totalTraffic))
        .attr('fill', d => d.departures > d.arrivals ? "steelblue" : "darkorange");

    circles
        .style("--departure-ratio", d => stationFlow(d.departures / d.totalTraffic));
    

    console.log("Scatter plot updated for time:", timeFilter);
}
