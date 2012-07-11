/**
 * Most of the credit for this Layer goes to DGuidi in https://gist.github.com/1716010.  
 * I built off of his work and added TMS like support for GeoJSON layers.
 */

L.TileLayer.Canvas.GeoJSON = L.TileLayer.Canvas.extend({
	// set default options
	options: {
		debug: false,
		tileSize: 256,
		style: {
			point: {
				color: 'rgba(252,146,114,0.6)',
				radius: 5
			},
			line: {
				color: 'rgba(161,217,155,0.8)',
				size: 3
			},
			polygon: {
				color: 'rgba(43,140,190,0.4)',
				outline: {
					color: 'rgb(0,0,0)',
					size: 1
				}
			},
			callback: null
		}
	},

	initialize: function (url, options) { // (String, Object)

		var params = L.Util.extend({}, this.options), i;

		this._url = url;

		for (i in options) {
			if (!this.options.hasOwnProperty(i)) {
				params[i] = options[i];
			}
		}

		L.Util.setOptions(this, params);
	},

	/**
	 * Main entry point.  Draws the GeoJSON tile at tilepoint on the canvas.
	 * @param {Object} canvas
	 * @param {L.Point} tilePoint
	 * @param {Number} zoom
	 */

	drawTile: function (canvas, tilePoint, zoom) {
		var ctx = {
			canvas: canvas,
			tile: tilePoint,
			zoom: zoom
		};

		if (this.options.debug) {
			this._drawDebugInfo(ctx);
		}
		this._draw(ctx);
	},

	/** 
	 * Parse JSON for older browsers. (I'm looking at you IE.)
	 * From json2.js
	 * @param {String} text
	 * @param {Function} reviver
	 * 
	 * @returns {Object}
	 */ 
	_parse: function (text, reviver) {
		var j;

		function walk(holder, key) {

			var k, v, value = holder[key];
			if (value && typeof value === 'object') {
				for (k in value) {
					if (Object.prototype.hasOwnProperty.call(value, k)) {
						v = walk(value, k);
						if (v !== undefined) {
							value[k] = v;
						} else {
							delete value[k];
						}
					}
				}
			}
			return reviver.call(holder, key, value);
		}

		text = String(text);
		cx.lastIndex = 0;
		if (cx.test(text)) {
			text = text.replace(cx, function (a) {
				return '\\u' +
					('0000' + a.charCodeAt(0).toString(16)).slice(-4);
			});
		}

		if (/^[\],:{}\s]*$/
				.test(text.replace(/\\(?:["\\\/bfnrt]|u[0-9a-fA-F]{4})/g, '@')
					.replace(/"[^"\\\n\r]*"|true|false|null|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?/g, ']')
					.replace(/(?:^|:|,)(?:\s*\[)+/g, ''))) {

			j = eval('(' + text + ')');
			return typeof reviver === 'function'
				? walk({'': j}, '')
				: j;
		}

		throw new SyntaxError('JSON.parse');
	},

	/** 
	 * Use the XHR to retrieve our JSON data to be displayed.
	 * @param {String} url
	 * @param {Function} callback
	 * @param {String} mimeType
	 *
	 * @returns {Object}
	 */ 
	_request: function (url, callback, mimeType) {
		var req;

		function getXHR() {
			if (window.XMLHttpRequest
				&& ('file:' !== window.location.protocol || !window.ActiveXObject)) {
				return new XMLHttpRequest();
			} else {
				try { return new ActiveXObject('Microsoft.XMLHTTP'); } catch (e) {}
				try { return new ActiveXObject('Msxml2.XMLHTTP.6.0'); } catch (e) {}
				try { return new ActiveXObject('Msxml2.XMLHTTP.3.0'); } catch (e) {}
				try { return new ActiveXObject('Msxml2.XMLHTTP'); } catch (e) {}
			}
			return false;
		}

		function send() {
			req = getXHR();
			if (mimeType && req.overrideMimeType) {
				req.overrideMimeType(mimeType);
			} else {
				req.overrideMimeType("application/json")
			}
			req.open("GET", url, true);
			req.onreadystatechange = function (e) {
				var data;
				if (req.readyState === 4) {
					if (req.status < 300) {
						if(JSON) {
							data = JSON.parse(req.response);
						} else {
							data = this._parse(req.response);
						}
						callback(data);
					}
				}
			};
			req.send(null);
		}
		function abort(hard) {
			if (hard && req) {
				req.abort(); return true;
			}
			return false;
		}
		send();
		return {abort: abort,send: send};
	},

	_tilePoint: function (ctx, coords) {
		// start coords to tile 'space'
		var s = ctx.tile.multiplyBy(this.options.tileSize), p, x, y;

		// actual coords to tile 'space'
		p = this._map.project(new L.LatLng(coords[1], coords[0]));

		// point to draw		
		x = Math.round(p.x - s.x);
		y = Math.round(p.y - s.y);
		return {
			x: x,
			y: y
		};
	},

	_clip: function (ctx, points) {
		var nw = ctx.tile.multiplyBy(this.tileSize),
			se = nw.add(new L.Point(this.tileSize, this.tileSize)),
			bounds = new L.Bounds([nw, se]),
			len = points.length,
			out = [], i, seg;

		for (i = 0; i < len - 1; i = i + 1) {
			seg = L.LineUtil.clipSegment(points[i], points[i + 1], bounds, i);
			if (!seg) {
				continue;
			}
			out.push(seg[0]);
			// if segment goes out of screen, or it's the last one, it's the end of the line part
			if ((seg[1] !== points[i + 1]) || (i === len - 2)) {
				out.push(seg[1]);
			}
		}
		return out;
	},

	_isActuallyVisible: function (coords) {
		var coord = coords[0],
			min = [coord.x, coord.y],
			max = [coord.x, coord.y],
			diff0, diff1, visible, i;

		for (i = 1; i < coords.length; i++) {
			coord = coords[i];
			min[0] = Math.min(min[0], coord.x);
			min[1] = Math.min(min[1], coord.y);
			max[0] = Math.max(max[0], coord.x);
			max[1] = Math.max(max[1], coord.y);
		}

		diff0 = max[0] - min[0];
		diff1 = max[1] - min[1];

		if (this.options.debug) {
			console.log(diff0 + ' ' + diff1);
		}

		visible = diff0 > 1 || diff1 > 1;

		return visible;
	},

	_drawPoint: function (ctx, geom, style) {

		var p, c, g;

		if (!style) {
			return;
		}

		p = this._tilePoint(ctx, geom);
		c = ctx.canvas;
		g = c.getContext('2d');
		g.beginPath();
		g.fillStyle = style.color;
		g.arc(p.x, p.y, style.radius, 0, Math.PI * 2);
		g.closePath();
		g.fill();
		g.restore();
	},

	_drawLineString: function (ctx, geom, style) {
		if (!style) {
			return;
		}

		var coords = geom, proj = [], i, g;
		coords = this._clip(ctx, coords);
		coords = L.LineUtil.simplify(coords, 1);

		for (i = 0; i < coords.length; i++) {
			proj.push(this._tilePoint(ctx, coords[i]));
		}
		if (!this._isActuallyVisible(proj)) {
			return;
		}

		g = ctx.canvas.getContext('2d');
		g.strokeStyle = style.color;
		g.lineWidth = style.size;
		g.beginPath();
		for (i = 0; i < proj.length; i++) {
			var method = (i === 0 ? 'move' : 'line') + 'To';
			g[method](proj[i].x, proj[i].y);
		}
		g.stroke();
		g.restore();
	},

	_drawDebugInfo: function (ctx) {
		var max = this.tileSize, 
			g = ctx.canvas.getContext('2d');
		g.strokeStyle = '#000000';
		g.fillStyle = '#FFFF00';
		g.strokeRect(0, 0, max, max);
		g.font = "12px Arial";
		g.fillRect(0, 0, 5, 5);
		g.fillRect(0, max - 5, 5, 5);
		g.fillRect(max - 5, 0, 5, 5);
		g.fillRect(max - 5, max - 5, 5, 5);
		g.fillRect(max / 2 - 5, max / 2 - 5, 10, 10);
		g.strokeText(ctx.tile.x + ' ' + ctx.tile.y + ' ' + ctx.zoom, max / 2 - 30, max / 2 - 10);
	},

	_drawPolygon: function (ctx, geom, style) {

		var el, g, coords, outline, method, i, proj;

		if (!style) {
			return;
		}

		for (el = 0; el < geom.length; el++) {
			coords = geom[el];
			proj = [];
			coords = this._clip(ctx, coords);

			for (i = 0; i < coords.length; i++) {
				proj.push(this._tilePoint(ctx, coords[i]));
			}

			if (!this._isActuallyVisible(proj)) {
				continue;
			}

			g = ctx.canvas.getContext('2d');
			outline = style.outline;
			g.fillStyle = style.color;
			if (outline) {
				g.strokeStyle = outline.color;
				g.lineWidth = outline.size;
			}
			g.beginPath();
			for (i = 0; i < proj.length; i++) {
				method = (i === 0 ? 'move' : 'line') + 'To';
				g[method](proj[i].x, proj[i].y);
			}
			g.closePath();
			g.fill();
			if (outline) {
				g.stroke();
			}
		}
	},

	 /**
	  * Draws the a tile at the point provided in ctx.  
	  * @param {Object} ctx
	  */
	_draw: function (ctx) {

		var loader = this._request, 
			url = this.getTileUrl(ctx.tile, ctx.zoom),
			self = this, j, geoJSON;

		loader(url, function (data) {

			var feature, style, type, geom, len, i;

			for (i = 0; i < data.features.length; i++) {
				feature = data.features[i];
				style = self.styleFor(feature);
				type = feature.geometry.type;
				geom = feature.geometry.coordinates;
				if(geom) {
					len = geom.length;
					switch (type) {
						case 'Point':
							self._drawPoint(ctx, geom, style);
							break;

						case 'MultiPoint':
							for (j = 0; j < len; j++) {
								self._drawPoint(ctx, geom[j], style);
							}
							break;

						case 'LineString':
							self._drawLineString(ctx, geom, style);
							break;

						case 'MultiLineString':
							for (j = 0; j < len; j++) {
								self._drawLineString(ctx, geom[j], style);
							}
							break;

						case 'Polygon':
							self._drawPolygon(ctx, geom, style);
							break;

						case 'MultiPolygon':
							for (j = 0; j < len; j++) {
								self._drawPolygon(ctx, geom[j], style);
							}
							break;

						default:
							throw new Error('Unmanaged type: ' + type);
					}
				}
			}
		});
	},

	/**
	 * Styling for the GeoJSON Object.  If you want to do
	 * some kind of per-feature styling, use the callback to
	 * return the necessary styles.
	 * @param {Object} feature - the GeoJSON feature being drawn
	 *
	 * @return {Object} style
	 */
	styleFor: function (feature) {
		var type = feature.geometry.type;
		if (this.options.style.callback) {
			return this.options.style.callback(feature);
		}
		switch (type) {
			case 'Point':
			case 'MultiPoint':
				return this.options.style.point;

			case 'LineString':
			case 'MultiLineString':
				return this.options.style.line; 

			case 'Polygon':
			case 'MultiPolygon':
				return this.options.style.polygon;

			default:
				return null;
		}
	}
});
