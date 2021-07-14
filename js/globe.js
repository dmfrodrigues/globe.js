
class Globe {
    static _countries;
    static _countryById;

    static async _initializeStaticAsync(){
        let [worldData, countryNames] = await Promise.all([
            d3.json("https://unpkg.com/world-atlas@1/world/110m.json"),
            d3.tsv("https://raw.githubusercontent.com/KoGor/Map-Icons-Generator/master/data/world-110m-country-names.tsv")
        ]);
        
        Globe._countries = topojson.feature(worldData, worldData["objects"]["countries"]).features;
        
        Globe._countryById = {};
        countryNames.forEach(function (d) {
            Globe._countryById[d.id] = d.name;
        });
    }

    constructor(svgElSelector, size){
        this._size = size;

        this._svg = d3.select(svgElSelector)
            .attr("width", this._size)
            .attr("height", this._size);
        this._svgEl = document.querySelector(svgElSelector);
        this._projection = d3.geoOrthographic()
            .scale(this._size/2)
            .translate([this._size / 2, this._size / 2]);
        this._path = d3.geoPath().projection(this._projection);

        this._originalRotation = [0, 0, 0];
    }

    async initialize() {
        this._drawWater();

        if(Globe._countries === undefined || Globe._countryById === undefined){
            await Globe._initializeStaticAsync();
        }
        
        this._drawAllCountries();

        // this._timerCallback(0);
    }

    _drawWater(){
        this._svg.append("path")
            .datum({type: "Sphere"})
            .attr("class", "water")
            .attr("d", this._path);
    }

    _drawAllCountries(){
        this._svg.selectAll("path.land")
            .data(Globe._countries)
            .enter()
            .append("a")
            .each(
                function (feature) {
                    let id = parseInt(feature.id);
                    let countryName = "undefined";
                    try {
                        countryName = "anchor_" + Globe._countryById[id].split(' ').join('_');
                    } catch (err) {
                        console.log(countryName)
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
                        countryName = Globe._countryById[id].split(' ').join('_');
                    } catch (err) {
                        console.log(countryName)
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

    set originalRotation (rot){
        this._originalRotation = rot;
    }

    addAnchor(country, href){
        d3.select("#anchor_" + country.split(' ').join('_')).attr("href", href);
    }

    registerRotation(delay, speed){
        let self = this;
        d3.interval(function (elapsed) {
            self._timerCallback(elapsed, speed);
        }, delay);
    }

    _timerCallback(elapsed, speed){
        this._projection.rotate(
            [
                this._originalRotation[0] + speed * elapsed,
                this._originalRotation[1],
                this._originalRotation[2]
            ]
        );
        this._svg.selectAll("path").attr("d", this._path);
    }
}
