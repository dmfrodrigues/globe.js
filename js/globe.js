/**
 * @brief A class to manage a globe.
 */
class Globe {
    static _COUNTRIES;
    static _COUNTRY_BY_ID;

    /**
     * @brief Construct from svg element selector and size.
     * 
     * @param {String}  svgElSelector   String to use as selector of the svg element to be managed
     * @param {Real}    size            Width and height (in pixels) of the area (svg) where the globe will be drawn
     */
    constructor(svgElSelector, size){
        this._size = size;

        this._svg = d3.select(svgElSelector)
            .attr("width", this._size)
            .attr("height", this._size);
        this._map = this._svg.append("g");
        this._svgEl = document.querySelector(svgElSelector);
        this._projection = d3.geoOrthographic()
            .scale(this._size/2)
            .translate([this._size / 2, this._size / 2]);
        this._path = d3.geoPath().projection(this._projection);

        this._markerGroup = this._map.append("g");

        this._rotationTimer = null;
        this._rotationDelay = null;
        this._rotationSpeed = null;
        this._tprev = null;
        this._rotationResumeTimer = null;

        this._locations = [];
    }

    /**
     * @brief Initialize static private members asynchronously.
     * 
     * Initializes, for instance, the coordinates of each country,
     * as well as each country's code (according to the coordinates dataset) and name.
     */
    static async _initializeStaticAsync(){
        let [worldData, countryNames] = await Promise.all([
            d3.json("https://unpkg.com/world-atlas@1/world/110m.json"),
            d3.tsv("https://raw.githubusercontent.com/KoGor/Map-Icons-Generator/master/data/world-110m-country-names.tsv")
        ]);
        
        Globe._COUNTRIES = topojson.feature(worldData, worldData["objects"]["countries"]).features;
        
        Globe._COUNTRY_BY_ID = {};
        countryNames.forEach(function (d) {
            Globe._COUNTRY_BY_ID[d.id] = d.name;
        });
    }

    /**
     * @brief Initialize the parts of globe that might require asynchronous operations.
     * 
     * If not yet initialized, this function will initialize the static private members required
     * to draw the countries.
     */
    async initialize() {
        if(Globe._COUNTRIES === undefined || Globe._COUNTRY_BY_ID === undefined){
            await Globe._initializeStaticAsync();
        }

        this._drawWater();
        this._drawAllCountries();
    }

    /**
     * @brief Sensitivity of the rotation.
     * 
     * Currently adjusted so that, if the user grabs a point close to the center of the viewbox,
     * the point it is dragging travels approximately at the same speed as the cursor.
     */
    static _ROTATION_SENSITIVITY = 0.09;

    static _ROTATION_RESUME_TIMEOUT = 10000;

    /**
     * @brief Enable dragging the globe.
     * 
     * Will cause the globe to rotate.
     * 
     * To avoid nasty situations where the globe ends up "sideways" (rotated in the roll axis),
     * we only allow the globe to rotate in latitude (pitch axis) and longitude (yaw axis).
     * 
     * Dragging is tuned so that, if the user grabs a point close to the center of the viewbox,
     * the point it is dragging travels approximately at the same speed as the cursor.
     */
    enableDrag(){
        let self = this;
        this._svg.call(d3.drag()
            .subject(function () {
                let r = self._projection.rotate();
                let s = self._projection.scale();
                const c = Globe._ROTATION_SENSITIVITY / s * self._size;
                return {
                    x: +r[0] / c,
                    y: -r[1] / c
                };
            })
            .on("start", function (event, d) {
                // Stop "timer"
                if(self._rotationTimer !== null){
                    self._rotationTimer.stop();
                    self._rotationTimer = null;
                    console.log("Stopped rotation");
                }

                // Stop "resume timer"
                if(self._rotationResumeTimer !== null){
                    self._rotationResumeTimer.stop();
                    self._rotationResumeTimer = null;
                    console.log("Stopped rotation resume");
                }
            })
            .on("drag", function (event, d) {
                let r = self._projection.rotate();
                let s = self._projection.scale();
                const c = Globe._ROTATION_SENSITIVITY / s * self._size;
                self._projection.rotate([
                    +event.x * c,
                    -event.y * c,
                    r[2]
                ]);
                self._recalculate();
            })
            .on("end", function (event, d) {
                // Create "resume timer"
                self._rotationResumeTimer = d3.timeout(function(){
                    console.log("Resuming rotation");
                    self.registerRotation(self._rotationDelay, self._rotationSpeed);
                    self._rotationResumeTimer = null;
                }, Globe._ROTATION_RESUME_TIMEOUT);
                console.log("Registered resume rotation");
            })
        );
    }

    /**
     * @brief Enable zooming the globe.
     * 
     * Scrolling to the front will cause the globe to zoom-in,
     * scrolling to the back will cause it to zoom-out.
     */
    enableZoom(){
        let self = this;
        this._svg.call(d3.zoom()
            .scaleExtent([0.75, 50]) //bound zoom
            .on("zoom", function (event, d) {
                let s = self._size/2;
                let news = s * event.transform.k;
                self._projection.scale(news);
                self._recalculate();
            })
        );
    }

    _drawWater(){
        this._map.append("path")
            .datum({type: "Sphere"})
            .attr("class", "water")
            .attr("d", this._path);
    }

    _drawAllCountries(){
        this._map.selectAll("path.land")
            .data(Globe._COUNTRIES)
            .enter()
            .append("a")
            .each(
                function (feature) {
                    let id = parseInt(feature.id);
                    let countryName = "undefined";
                    try {
                        countryName = "anchor_" + Globe._COUNTRY_BY_ID[id].split(' ').join('_');
                    } catch (err) {
                        console.warn(countryName);
                    }
                    d3.select(this).attr("id", countryName);
                }
            )
            .append("path")
            .attr("class", "land")
            .attr("d", this._path)
            .each(
                function (feature) {
                    let id = parseInt(feature.id);
                    let countryName = "undefined";
                    try {
                        countryName = Globe._COUNTRY_BY_ID[id].split(' ').join('_');
                    } catch (err) {
                        console.warn(countryName);
                    }
                    d3.select(this).attr("id", countryName);
                }
            );
    }

    nativeCountry(country){
        d3.selectAll("#" + country.split(' ').join('_')).attr("class", "land native");
    }

    highlightCountry(country){
        d3.selectAll("#" + country.split(' ').join('_')).attr("class", "land highlight");
    }

    /**
     * @brief Add a point to the globe.
     * 
     * The point's position is specified by its coordinates in the globe, in format [lon, lat].
     * Longitude increases east and latitude increases north.
     * 
     * @param {Array} coord Coordinates array
     * @param {String} tag Tag of the new point
     */
    addPoint(coord, tag) {
        this._locations.push({
            coordinates: coord,
            tag: tag
        });

        const markers = this._markerGroup
        .selectAll('.marker')
        .data(this._locations);
    
        const newMarkers = markers
            .enter()
            .append("g")
            .attr("class", "marker");
            
        newMarkers.append("circle").attr("r", 3);

        this._drawMarkers();
    }

    set rotation (rot){
        this._projection.rotate(rot);
    }

    addAnchor(country, href){
        d3.select("#anchor_" + country.split(' ').join('_')).attr("href", href);
    }

    registerRotation(delay, speed){
        this._rotationDelay = delay;
        this._rotationSpeed = speed;
        this._tprev = 0;
        let self = this;
        this._rotationTimer = d3.interval(function (elapsed) { self._timerCallback(elapsed); }, this._rotationDelay);
        console.log("Registered rotation");
    }

    _timerCallback(t){
        const dt = t-this._tprev;
        const r = this._projection.rotate();
        r[0] += this._rotationSpeed * dt
        this._projection.rotate(r);
        this._recalculate();
        this._tprev = t;
    }

    _recalculate(){
        this._map.selectAll("path").attr("d", this._path);
        this._drawMarkers();
    }

    _drawMarkers(){
        const self = this;
        const center = [this._size/2, this._size/2];
        const centerXY = self._projection.invert(center);

        const markers = this._markerGroup
            .selectAll('.marker');

        markers
            .selectAll("circle")
            .attr('cx', d => self._projection(d.coordinates)[0])
            .attr('cy', d => self._projection(d.coordinates)[1])
            .attr('fill', d => {
                const dist = d3.geoDistance(d.coordinates, centerXY);
                return dist > (Math.PI / 2) ? 'none' : 'tomato';
            });
            
        this._markerGroup.each(function() {
            this.parentNode.appendChild(this);
        });
    }
}
