L.TileLayer.Canvas.GeoJSON = L.TileLayer.Canvas.extend({
	// set default options
	options: {
		debug: true,
		tileSize: 256
	},

	initialize: function (url, options) { // (String, Object)
		this._url = url;

		var params = L.Util.extend({}, this.options);

		for (var i in options) {
			if (!this.options.hasOwnProperty(i)) {
				params[i] = options[i];
			}
		}

		L.Util.setOptions(this, params);
	},


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

	_request: function (url, callback, mimeType) {
		var req;

		function getXHR () {
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

		function send () {
			req = getXHR();
			if (mimeType && req.overrideMimeType) {
				req.overrideMimeType(mimeType);
			}
			req.open("GET", url, true);
			req.onreadystatechange = function (e) {
				if (req.readyState === 4) {
					if (req.status < 300) {
						callback(req);
					}
				}
			};
			req.send(null);
		}
		function abort (hard) {
			if (hard && req) {
				req.abort(); return true;
			}
			return false;
		}

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

	_draw: function (ctx) {

		var loader = this._request, 
			url = this.getTileUrl(ctx.tile, ctx.zoom),
			self = this, j, geoJSON;

		loader(url, function (data) {

			var feature, style, type, geom, len, i;

			data = JSON.parse(data.response)
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
		}, "application/json").send();
	},
	styleFor: function (feature) {
        var type = feature.geometry.type;
        switch (type) {
            case 'Point':
            case 'MultiPoint':
                return {
                    color: 'rgba(252,146,114,0.6)',
                    radius: 5
                };
                
            case 'LineString':
            case 'MultiLineString':
                return {
                    color: 'rgba(161,217,155,0.8)',
                    size: 3
                };

            case 'Polygon':
            case 'MultiPolygon':
                return {
                    color: 'rgba(43,140,190,0.4)',
                    outline: {
                        color: 'rgb(0,0,0)',
                        size: 1
                    }
                };

            default:
                return null;
        }
    }
});
