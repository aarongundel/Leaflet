L.TileLayer.Canvas.GeoJSON = L.TileLayer.extend({
	defaultParams: {
		
	},

	initialize: function (url, options) { // (String, Object)
		this._url = url;

		var params = L.Util.extend({}, this.defaultParams);

		for (var i in options) {
			// all keys that are not TileLayer options go to WMS params
			if (!this.options.hasOwnProperty(i)) {
				wmsParams[i] = options[i];
			}
		}

		this.wmsParams = wmsParams;

		L.Util.setOptions(this, options);
	},

	getXHR: function () {
		if (window.XMLHttpRequest
			&& ('file:' != window.location.protocol || !window.ActiveXObject)) {
			return new XMLHttpRequest;
		} else {
			try { return new ActiveXObject('Microsoft.XMLHTTP'); } catch(e) {}
			try { return new ActiveXObject('Msxml2.XMLHTTP.6.0'); } catch(e) {}
			try { return new ActiveXObject('Msxml2.XMLHTTP.3.0'); } catch(e) {}
			try { return new ActiveXObject('Msxml2.XMLHTTP'); } catch(e) {}
		}
		return false;
	}

	request: function (url, callback, mimeType) {
		var req;

		function send () {
			req = getXHR();
			if (mimeType && req.overrideMimeType) {
				req.overrideMimeType(mimeType);
			}
			req.open("GET", url, true);
			req.onreadystatechange = function(e) {
			if (req.readyState == 4) {
				active--;
				if (req.status < 300) callback(req);
					process();
				}
			};
			req.send(null);
		}
		function abort(hard) {
			if (dequeue(send)) return true;
			if (hard && req) { req.abort(); return true; }
			return false;
		}

		queued.push(send);
		process();
		return {abort: abort};
	}

	_drawPoint: function (ctx, geom, style) {
		if (!style) {
			return;
		}
		
		var p = this._tilePoint(ctx, geom);
		var c = ctx.canvas;
		var g = c.getContext('2d');
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
		
		var coords = geom, proj = [], i;
		coords = this._clip(ctx, coords);
		coords = L.LineUtil.simplify(coords, 1);
		for (i = 0; i < coords.length; i++) {
			proj.push(this._tilePoint(ctx, coords[i]));
		}
		if (!this._isActuallyVisible(proj)) {
			return;
		}

		var g = ctx.canvas.getContext('2d');
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

	_drawPolygon: function (ctx, geom, style) {
		if (!style) {
			return;
		}
		
		for (var el = 0; el < geom.length; el++) {
			var coords = geom[el], proj = [], i;
			coords = this._clip(ctx, coords);
			for (i = 0; i < coords.length; i++) {
				proj.push(this._tilePoint(ctx, coords[i]));
			}
			if (!this._isActuallyVisible(proj)) {
				continue;
			}

			var g = ctx.canvas.getContext('2d');
			var outline = style.outline;
			g.fillStyle = style.color;
			if (outline) {
				g.strokeStyle = outline.color;
				g.lineWidth = outline.size;
			}
			g.beginPath();
			for (i = 0; i < proj.length; i++) {
				var method = (i === 0 ? 'move' : 'line') + 'To';
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
		// NOTE: this is the only part of the code that depends from external libraries (actually, jQuery only).
		var loader = $.getJSON;

		var nwPoint = ctx.tile.multiplyBy(this.tileSize);
		var sePoint = nwPoint.add(new L.Point(this.tileSize, this.tileSize));
		var nwCoord = this._map.unproject(nwPoint, ctx.zoom, true);
		var seCoord = this._map.unproject(sePoint, ctx.zoom, true);
		var bounds = [nwCoord.lng, seCoord.lat, seCoord.lng, nwCoord.lat];

		var url = this.createUrl(bounds);
		var self = this, j;
		loader(url, function (data) {
			for (var i = 0; i < data.features.length; i++) {
				var feature = data.features[i];
				var style = self.styleFor(feature);

				var type = feature.geometry.type;
				var geom = feature.geometry.coordinates;
				var len = geom.length;
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
		});
	}
});
