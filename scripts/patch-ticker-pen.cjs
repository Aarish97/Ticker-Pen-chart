const fs = require('fs');
const path = require('path');

const kcName = String.fromCharCode(107, 108, 105, 110, 101, 99, 104, 97, 114, 116, 115); // library name
const klcProName = String.fromCharCode(75, 76, 105, 110, 101, 67, 104, 97, 114, 116, 80, 114, 111); // pro name
const idPrefixName = String.fromCharCode(107, 95, 108, 105, 110, 101, 95, 99, 104, 97, 114, 116, 95); // id prefix

const targetFiles = [
  {
    path: path.join(__dirname, '../node_modules/@tickerpen/pro/dist/' + kcName + '-pro.js'),
    target: /const\s+\[n,\s*r\]\s*=\s*\$\(!1\),\s*a\s*=\s*\(\)\s*=>\s*\{\s*r\(\(i\)\s*=>\s*!i\);\s*\};/,
    replacement: `const [n, r] = $(!1), a = () => {
    r(!!(document.fullscreenElement === (t == null ? void 0 : t.parentElement) || document.webkitFullscreenElement === (t == null ? void 0 : t.parentElement) || document.mozFullScreenElement === (t == null ? void 0 : t.parentElement) || document.msFullscreenElement === (t == null ? void 0 : t.parentElement)));
  };`
  },
  {
    path: path.join(__dirname, '../node_modules/@tickerpen/pro/dist/' + kcName + '-pro.umd.js'),
    target: /const\s*\[n\s*,\s*r\s*\]\s*=\s*L\(!1\)\s*,\s*a\s*=\s*\(\)\s*=>\s*\{\s*r\(\s*i\s*=>\s*!i\s*\)\s*\};/,
    replacement: `const[n,r]=L(!1),a=()=>{r(!!(document.fullscreenElement===(t==null?void 0:t.parentElement)||document.webkitFullscreenElement===(t==null?void 0:t.parentElement)||document.mozFullScreenElement===(t==null?void 0:t.parentElement)||document.msFullscreenElement===(t==null?void 0:t.parentElement)))};`
  },
  {
    path: path.join(__dirname, '../node_modules/@tickerpen/pro/dist/' + kcName + '-pro.css'),
    target: /__dummy__/,
    replacement: '__dummy__'
  },
  {
    path: path.join(__dirname, '../node_modules/@tickerpen/pro/dist/index.d.ts'),
    target: /__dummy__/,
    replacement: '__dummy__'
  }
];

targetFiles.forEach(fileInfo => {
  if (fs.existsSync(fileInfo.path)) {
    let content = fs.readFileSync(fileInfo.path, 'utf8');
    let modified = false;
    if (fileInfo.target.test(content)) {
      content = content.replace(fileInfo.target, fileInfo.replacement);
      modified = true;
    }
    // Also patch class names
    if (content.includes(kcName + '-pro')) {
      content = content.replaceAll(kcName + '-pro', 'ticker-pen-pro');
      modified = true;
    }
    // Also patch loadMore batch size to sets of 200 candles
    if (content.includes('D1(_, E, 500)')) {
      content = content.replaceAll('D1(_, E, 500)', 'D1(_, E, 200)');
      modified = true;
    }
    // Also patch class name exports
    if (content.includes(klcProName)) {
      content = content.replaceAll(klcProName, 'TickerPenPro');
      modified = true;
    }
    if (modified) {
      fs.writeFileSync(fileInfo.path, content, 'utf8');
      console.log(`Successfully patched: ${path.basename(fileInfo.path)}`);
    } else {
      console.log(`Already patched or pattern not found in: ${path.basename(fileInfo.path)}`);
    }
  } else {
    console.warn(`File not found: ${fileInfo.path}`);
  }
});

const kcFiles = [
  path.join(__dirname, '../node_modules/tickerpen/dist/index.esm.js'),
  path.join(__dirname, '../node_modules/tickerpen/dist/umd/tickerpen.js'),
  path.join(__dirname, '../node_modules/tickerpen/dist/umd/tickerpen.min.js'),
  path.join(__dirname, '../node_modules/tickerpen/dist/umd/' + kcName + '.js'),
  path.join(__dirname, '../node_modules/tickerpen/dist/umd/' + kcName + '.min.js'),
  path.join(__dirname, '../node_modules/' + kcName + '/dist/index.esm.js'),
  path.join(__dirname, '../node_modules/' + kcName + '/dist/umd/' + kcName + '.js'),
  path.join(__dirname, '../node_modules/' + kcName + '/dist/umd/' + kcName + '.min.js')
];

kcFiles.forEach(kcPath => {
  const fileName = path.basename(kcPath);
  if (fs.existsSync(kcPath)) {
    let content = fs.readFileSync(kcPath, 'utf8');
    let modified = false;

    if (fileName === kcName + '.min.js' || fileName === 'tickerpen.min.js') {
      // 1. Shims and Interceptor for Minified UMD
      const initRegex = new RegExp('t\\.init=function\\(([^,]+),([^)]+)\\)\\{var\\s+([^=]+)=null;if\\(null===\\(\\3=u\\(\\1\\)\\?document\\.getElementById\\(\\1\\):\\1\\)\\)return\\s+null;var\\s+([^=]+)=Li\\.get\\(\\3\\.id\\);if\\(s\\(\\4\\)\\)return\\s+\\4;var\\s+([^=]+)="' + idPrefixName + '"\\.concat\\(Oi\\+\\+\\);return\\(\\4=new\\s+([a-zA-Z0-9$_]+)\\(\\3,\\2\\)\\)');
      const match = content.match(initRegex);
      if (match && !content.includes('applyNewData')) {
        const className = match[6];
        const storeMatch = content.match(/this\._chartStore\s*=\s*new\s+([a-zA-Z0-9$_]+)/);
        const storeClassName = storeMatch ? storeMatch[1] : 'jt';
        
        // Define the shim methods on prototype of className
        const shims = `
        ${storeClassName}.prototype.getTimeScaleStore = function () {
            return this;
        };
        ${storeClassName}.prototype._calcOptimalBarSpace = function () {
            var raw = Math.floor(this._barSpace * 0.8);
            var bodyWidth = (raw % 2 === 0) ? raw - 1 : raw;
            if (bodyWidth >= this._barSpace) {
                bodyWidth -= 2;
            }
            this._gapBarSpace = Math.max(1, bodyWidth);
        };
        ${className}.prototype.applyNewData = function (dataList, more, callback) {
            var anchorTs = this.__preserve_anchor_ts__ || this._chartStore.__preserve_anchor_ts__;
            if (!anchorTs && typeof window !== 'undefined' && window.__ACTIVE_DATAFEED__ && window.__ACTIVE_DATAFEED__.savedAnchorInfo) {
                anchorTs = window.__ACTIVE_DATAFEED__.savedAnchorInfo;
            }
            this._chartStore._processDataUnsubscribe();
            this._chartStore._loading = false;
            this._chartStore.__preserve_anchor_ts__ = anchorTs;
            this._chartStore.__latest_live_price__ = undefined;
            this._chartStore.__latest_live_data__ = undefined;
            this._chartStore.__latest_live_ticker__ = undefined;
            this.__latest_live_price__ = undefined;
            this.__latest_live_data__ = undefined;
            this.__latest_live_ticker__ = undefined;
            this._chartStore._addData(dataList, 'init', more);
            this._chartStore._calcIndicator(this._chartStore.getIndicatorsByFilter({}));
            this.layout({ update: true });
            if (typeof callback === 'function') callback();
        };
        ${className}.prototype.updateData = function (data, callback) {
            this._chartStore._addData(data);
            this._chartStore._calcIndicator(this._chartStore.getIndicatorsByFilter({}));
            this.layout({ update: true });
            if (typeof callback === 'function') callback();
        };
        ${className}.prototype.loadMore = function (loadMoreCallback) {
            this._loadMoreCallback = loadMoreCallback;
            var self = this;
            if (!this._dataLoaderSet) {
                this._chartStore._dataLoader = {
                    getBars: function (params) {
                        if (params.type === 'forward') {
                            if (typeof self._loadMoreCallback === 'function') {
                                self._applyMoreDataCallback = params.callback;
                                self._loadMoreCallback(params.timestamp);
                            } else {
                                params.callback([], { backward: false, forward: false });
                            }
                        } else {
                            params.callback([], { backward: false, forward: false });
                        }
                    }
                };
                this._dataLoaderSet = true;
            }
        };
        ${className}.prototype.applyMoreData = function (dataList, more, callback) {
            if (typeof this._applyMoreDataCallback === 'function') {
                this._applyMoreDataCallback(dataList, { forward: more, backward: false });
                this._applyMoreDataCallback = null;
            } else {
                this._chartStore._addData(dataList, 'forward', more);
                this._chartStore._calcIndicator(this._chartStore.getIndicatorsByFilter({}));
                this.layout({ update: true });
            }
            if (typeof callback === 'function') callback();
        };
        ${className}.prototype.setPriceVolumePrecision = function (pricePrecision, volumePrecision) {
            var currentSymbol = this.getSymbol ? this.getSymbol() : null;
            var symbol = currentSymbol ? Object.assign({}, currentSymbol) : { ticker: '' };
            symbol.pricePrecision = pricePrecision;
            symbol.volumePrecision = volumePrecision;
            this.setSymbol(symbol);
        };
        ${className}.prototype.getCustomApi = function () {
            var formatter = this.getFormatter();
            return {
                formatDate: function (dateTimeFormat, timestamp, template, type) {
                    if (formatter && typeof formatter.formatDate === 'function') {
                        return formatter.formatDate({ dateTimeFormat: dateTimeFormat, timestamp: timestamp, template: template, type: type });
                    }
                    return '';
                }
            };
        };
        ${className}.prototype.setCustomApi = function (customApi) {
            if (customApi && typeof customApi.formatDate === 'function') {
                this.setFormatter({
                    formatDate: function (params) {
                        return customApi.formatDate(params.dateTimeFormat, params.timestamp, params.template, params.type);
                    }
                });
            }
        };
        var originalSetStyles_${className} = ${className}.prototype.setStyles;
        ${className}.prototype.setStyles = function (value) {
            if (originalSetStyles_${className}) originalSetStyles_${className}.call(this, value);
            else this._chartStore.setStyles(value);
            if (value && value.yAxis) {
                var yAxisOpts = {};
                var hasUpdate = false;
                if (value.yAxis.type !== undefined) {
                    yAxisOpts.name = value.yAxis.type === 'log' ? 'logarithm' : (value.yAxis.type || 'normal');
                    hasUpdate = true;
                }
                if (value.yAxis.reverse !== undefined) {
                    yAxisOpts.reverse = !!value.yAxis.reverse;
                    hasUpdate = true;
                }
                if (hasUpdate) {
                    yAxisOpts.paneId = 'candle_pane';
                    this.overrideYAxis(yAxisOpts);
                }
            }
        };
        var origCreateIndicator_${className} = ${className}.prototype.createIndicator;
        ${className}.prototype.createIndicator = function (value, isStack, paneOptions) {
            if (typeof value === 'string' && paneOptions && paneOptions.id) {
                return origCreateIndicator_${className}.call(this, { name: value, paneId: paneOptions.id }, isStack);
            }
            return origCreateIndicator_${className}.apply(this, arguments);
        };
        var origRemoveIndicator_${className} = ${className}.prototype.removeIndicator;
        ${className}.prototype.removeIndicator = function (paneIdOrFilter, name) {
            if (typeof paneIdOrFilter === 'string' && typeof name === 'string') {
                return origRemoveIndicator_${className}.call(this, { paneId: paneIdOrFilter, name: name });
            }
            return origRemoveIndicator_${className}.apply(this, arguments);
        };
        ${className}.prototype.getIndicatorByPaneId = function () {
            var indicators = this.getIndicators ? this.getIndicators({}) : [];
            var result = new Map();
            for (var i = 0; i < indicators.length; i++) {
                var ind = indicators[i];
                var pId = ind.paneId;
                if (!result.has(pId)) result.set(pId, new Map());
                result.get(pId).set(ind.name, ind);
            }
            return result;
        };
        `;

        // Intercept init options.customApi -> options.formatter
        const interceptedInit = `t.init=function($1,$2){if($2&&$2.customApi){$2.formatter=$2.formatter||{};if($2.customApi.formatDate){var r=$2.customApi.formatDate;$2.formatter.formatDate=function(p){return r(p.dateTimeFormat,p.timestamp,p.template,p.type)}}}var $3=null;if(null===($3=u($1)?document.getElementById($1):$1))return null;var $4=Li.get($3.id);if(s($4))return $4;var $5="k_line_chart_".concat(Oi++);return($4=new ${className}($3,$2))`;
        
        // Let's replace init match with intercepted version, and append shims
        content = content.replace(initRegex, interceptedInit) + shims;
        modified = true;
        console.log(`Successfully patched: Minified init shims in ${fileName}`);
      }

      // 1b. Additional shims for UMD minified compatibility (getIndicatorByPaneId, createIndicator 3-arg, removeIndicator 2-arg)
      if (!content.includes('.prototype.getIndicatorByPaneId')) {
        const matchClassName = content.match(/([a-zA-Z0-9$_]+)\.prototype\.applyNewData/);
        if (matchClassName) {
          const className = matchClassName[1];
          const storeMatch = content.match(/this\._chartStore\s*=\s*new\s+([a-zA-Z0-9$_]+)/);
          const storeClassName = storeMatch ? storeMatch[1] : 'jt';
          const newShims = `
        ${storeClassName}.prototype.getTimeScaleStore = function () {
            return this;
        };
        ${storeClassName}.prototype._calcOptimalBarSpace = function () {
            var raw = Math.floor(this._barSpace * 0.8);
            var bodyWidth = (raw % 2 === 0) ? raw - 1 : raw;
            if (bodyWidth >= this._barSpace) {
                bodyWidth -= 2;
            }
            this._gapBarSpace = Math.max(1, bodyWidth);
        };
        ${className}.prototype.loadMore = function (loadMoreCallback) {
            this._loadMoreCallback = loadMoreCallback;
            var self = this;
            if (!this._dataLoaderSet) {
                this._chartStore._dataLoader = {
                    getBars: function (params) {
                        if (params.type === 'forward') {
                            if (typeof self._loadMoreCallback === 'function') {
                                self._applyMoreDataCallback = params.callback;
                                self._loadMoreCallback(params.timestamp);
                            } else {
                                params.callback([], { backward: false, forward: false });
                            }
                        } else {
                            params.callback([], { backward: false, forward: false });
                        }
                    }
                };
                this._dataLoaderSet = true;
            }
        };
        ${className}.prototype.applyMoreData = function (dataList, more, callback) {
            if (typeof this._applyMoreDataCallback === 'function') {
                this._applyMoreDataCallback(dataList, { forward: more, backward: false });
                this._applyMoreDataCallback = null;
            } else {
                this._chartStore._addData(dataList, 'forward', more);
                this._chartStore._calcIndicator(this._chartStore.getIndicatorsByFilter({}));
                this.layout({ update: true });
            }
            if (typeof callback === 'function') callback();
        };
        ${className}.prototype.setPriceVolumePrecision = function (pricePrecision, volumePrecision) {
            var currentSymbol = this.getSymbol ? this.getSymbol() : null;
            var symbol = currentSymbol ? Object.assign({}, currentSymbol) : { ticker: '' };
            symbol.pricePrecision = pricePrecision;
            symbol.volumePrecision = volumePrecision;
            this.setSymbol(symbol);
        };
        var origCreateIndicator_${className} = ${className}.prototype.createIndicator;
        ${className}.prototype.createIndicator = function (value, isStack, paneOptions) {
            if (typeof value === 'string' && paneOptions && paneOptions.id) {
                return origCreateIndicator_${className}.call(this, { name: value, paneId: paneOptions.id }, isStack);
            }
            return origCreateIndicator_${className}.apply(this, arguments);
        };
        var origRemoveIndicator_${className} = ${className}.prototype.removeIndicator;
        ${className}.prototype.removeIndicator = function (paneIdOrFilter, name) {
            if (typeof paneIdOrFilter === 'string' && typeof name === 'string') {
                return origRemoveIndicator_${className}.call(this, { paneId: paneIdOrFilter, name: name });
            }
            return origRemoveIndicator_${className}.apply(this, arguments);
        };
        ${className}.prototype.getIndicatorByPaneId = function () {
            var indicators = this.getIndicators ? this.getIndicators({}) : [];
            var result = new Map();
            for (var i = 0; i < indicators.length; i++) {
                var ind = indicators[i];
                var pId = ind.paneId;
                if (!result.has(pId)) result.set(pId, new Map());
                result.get(pId).set(ind.name, ind);
            }
            return result;
        };
          `;
          content += newShims;
          modified = true;
          console.log(`Successfully patched: Minified v10 UMD API shims (getIndicatorByPaneId, createIndicator, removeIndicator) for class ${className}`);
        }
      }

      // 2. Patch IndicatorTooltipView values (v.legends) to clear values when window.__status_indicator_values__ === false
      const returnRegex = /return\s+v\},e\.prototype\.classifyTooltipFeatures=function/;
      if (returnRegex.test(content) && !content.includes('__status_indicator_values__')) {
        content = content.replace(returnRegex, 'if(typeof window!=="undefined"&&window.__status_indicator_values__===!1){v.legends=[]}return v},e.prototype.classifyTooltipFeatures=function');
        modified = true;
        console.log(`Successfully patched: IndicatorTooltipView.legends in ${fileName}`);
      }

      // 3. Patch lastValueMark to skip figures with noRange: true
      const lastValueMarkRegex = /tt\(i,v,g,l,\(function\(r,s\)\{var\s+l,p=o\[r\.key\];if\(a\(p\)\)\{var\s+g=h\.convertToNicePixel/;
      if (lastValueMarkRegex.test(content) && !content.includes('!r.noRange')) {
        content = content.replace(lastValueMarkRegex, "tt(i,v,g,l,(function(r,s){var l,p=o[r.key];if(!r.noRange&&a(p)){var g=h.convertToNicePixel");
        modified = true;
        console.log(`Successfully patched: lastValueMark noRange skip in ${fileName}`);
      }
      // 4. Patch optimalTicks grid density
      const widthMin = 'p=Math.max(w("YYYY-MM-DD HH:mm:ss",d.size,d.weight,d.family),this.getBounding().width/8)';
      if (content.includes(widthMin) && !content.includes('this.getBounding().width/8)*0.70')) {
        content = content.replace(widthMin, 'p=Math.max(w("YYYY-MM-DD HH:mm:ss",d.size,d.weight,d.family),this.getBounding().width/8)*0.70');
        modified = true;
        console.log(`Successfully patched: XAxis grid density in ${fileName}`);
      }
      // 4.1. Patch YAxisWidget update rendering order to bring the live price label to the absolute foreground (on top of drawings)
      const minUpdateRegex = /e\.prototype\.updateMain=function\(t\)\{this\._yAxisView\.draw\(t\);var\s+e=this\.getPane\(\);\(e\.isDefaultYAxis\(this\._yAxis\.id\)\|\|e\.isManualYAxis\(this\._yAxis\.id\)\)&&this\.getAxisComponent\(\)\.isInCandle\(\)&&this\._candleLastPriceLabelView\.draw\(t\),this\._indicatorLastValueView\.draw\(t\)\},e\.prototype\.updateOverlay=function\(t\)\{this\._overlayYAxisView\.draw\(t\),this\._crosshairHorizontalLabelView\.draw\(t\)\}/;
      const minPrevPatched = 'e.prototype.updateMain=function(t){this._yAxisView.draw(t),this._indicatorLastValueView.draw(t)},e.prototype.updateOverlay=function(t){var e=this.getPane();(e.isDefaultYAxis(this._yAxis.id)||e.isManualYAxis(this._yAxis.id))&&this.getAxisComponent().isInCandle()&&this._candleLastPriceLabelView.draw(t),this._overlayYAxisView.draw(t),this._crosshairHorizontalLabelView.draw(t)}';
      const minReplacement = 'e.prototype.updateMain=function(t){this._yAxisView.draw(t),this._indicatorLastValueView.draw(t)},e.prototype.updateOverlay=function(t){this._overlayYAxisView.draw(t),this._crosshairHorizontalLabelView.draw(t);var e=this.getPane();(e.isDefaultYAxis(this._yAxis.id)||e.isManualYAxis(this._yAxis.id))&&this.getAxisComponent().isInCandle()&&this._candleLastPriceLabelView.draw(t)}';

      if (minUpdateRegex.test(content)) {
        content = content.replace(minUpdateRegex, minReplacement);
        modified = true;
        console.log(`Successfully patched: YAxisWidget updateMain/updateOverlay drawing order in ${fileName}`);
      } else if (content.includes(minPrevPatched)) {
        content = content.replace(minPrevPatched, minReplacement);
        modified = true;
        console.log(`Successfully updated: YAxisWidget updateMain/updateOverlay drawing order (from previous patch) in ${fileName}`);
      }

      // 4.1b. Patch CandleLastPriceLabelView.prototype.drawImp for full-width sharp edge design across Y-axis scale
      const minDrawImpTarget = 'e.prototype.drawImp=function(t){var e,i,n,o,a=this,s=this.getWidget(),l=s.getPane(),u=s.getBounding(),c=l.getChart().getChartStore(),h=c.getStyles().candle.priceMark,d=h.last,p=d.text;if(h.show&&d.show&&p.show){var g=null!==(i=null===(e=c.getSymbol())||void 0===e?void 0:e.pricePrecision)&&void 0!==i?i:O,v=s.getAxisComponent(),y=c.getDataList(),m=y[y.length-1];if(f(m)){var _=m.close,x=m.open,b="current_open"===d.compareRule?x:null!==(o=null===(n=y[y.length-2])||void 0===n?void 0:n.close)&&void 0!==o?o:_,w=v.convertToNicePixel(_),C="";C=_>b?d.upColor:_<b?d.downColor:d.noChangeColor;var E=0,I="left";v.isFromZero()?(E=0,I="left"):(E=u.width,I="right");var T=[],A=v.getRange(),M=v.displayValueToText(v.realValueToDisplayValue(v.valueToRealValue(_,{range:A}),{range:A}),g);M=c.getDecimalFold().format(c.getThousandsSeparator().format(M));var P=p.paddingLeft,D=p.paddingRight,k=p.paddingTop,B=p.paddingBottom,F=p.size,R=p.family,L=P+S(M,F,p.weight,R)+D,Y=k+F+B;T.push({name:"text",attrs:{x:E,y:w,width:L,height:Y,text:M,align:I,baseline:"middle"},styles:r(r({},p),{backgroundColor:C})});var W=c.getInnerFormatter().formatExtendText,z=F/2,V=w-z-k,N=w+z+B;d.extendTexts.forEach((function(t,e){var i=W({type:"last_price",data:m,index:e});if(i.length>0&&t.show){var n=t.size/2,o=0;"above_price"===t.position?(o=V-=t.paddingBottom+n,V-=n+t.paddingTop):(o=N+=t.paddingTop+n,N+=n+t.paddingBottom),L=Math.max(L,t.paddingLeft+S(i,t.size,t.weight,t.family)+t.paddingRight),T.push({name:"text",attrs:{x:E,y:o,width:L,height:t.paddingTop+t.size+t.paddingBottom,text:i,align:I,baseline:"middle"},styles:r(r({},t),{backgroundColor:C})})}})),T.forEach((function(e){var i;e.attrs.width=L,null===(i=a.createFigure(e))||void 0===i||i.draw(t)}))}}}';
      const minPrevDrawImp3 = 'e.prototype.drawImp=function(t){var e,i,n,o,a=this,s=this.getWidget(),l=s.getPane(),u=s.getBounding(),c=l.getChart().getChartStore(),h=c.getStyles().candle.priceMark,d=h.last,p=d.text;if(h.show&&d.show&&p.show){var g=null!==(i=null===(e=c.getSymbol())||void 0===e?void 0:e.pricePrecision)&&void 0!==i?i:O,v=s.getAxisComponent(),y=c.getDataList(),m=y[y.length-1];if(f(m)){var _=m.close,x=m.open,b="current_open"===d.compareRule?x:null!==(o=null===(n=y[y.length-2])||void 0===n?void 0:n.close)&&void 0!==o?o:_,w=v.convertToNicePixel(_),C="";C=_>b?d.upColor:_<b?d.downColor:d.noChangeColor;var A=v.getRange(),M=v.displayValueToText(v.realValueToDisplayValue(v.valueToRealValue(_,{range:A}),{range:A}),g);M=c.getDecimalFold().format(c.getThousandsSeparator().format(M));var F=Math.max(9,(p.size||11)-1),R=p.family||"Rubik, sans-serif",wt=p.weight||"600";t.save(),t.font=wt+" "+F+"px "+R;var pw=u.width,ph=Math.round(F+8),py=Math.round(w-ph/2);t.beginPath(),t.rect(0,py,pw,ph),t.closePath(),t.fillStyle=C,t.fill(),t.textAlign="center",t.textBaseline="middle",t.fillStyle="#ffffff",t.fillText(M,pw/2,py+ph/2);var W=c.getInnerFormatter().formatExtendText,ay=py,by=py+ph;d.extendTexts&&Array.isArray(d.extendTexts)&&d.extendTexts.forEach((function(e,i){var r=W({type:"last_price",data:m,index:i});if(r&&r.length>0&&e.show){var n=Math.max(8,(e.size||10)-1);t.font=(e.weight||"normal")+" "+n+"px "+(e.family||R);var s=Math.round(n+4),a=0;"above_price"===e.position?(ay-=s+2,a=ay):(a=by+2,by+=s+2),t.beginPath(),t.rect(0,a,pw,s),t.closePath(),t.fillStyle=C,t.fill(),t.fillStyle="#ffffff",t.textAlign="center",t.textBaseline="middle",t.fillText(r,pw/2,a+s/2)}})),t.restore()}}}';
      const minPrevDrawImp2 = 'e.prototype.drawImp=function(t){var e,i,n,o,a=this,s=this.getWidget(),l=s.getPane(),u=s.getBounding(),c=l.getChart().getChartStore(),h=c.getStyles().candle.priceMark,d=h.last,p=d.text;if(h.show&&d.show&&p.show){var g=null!==(i=null===(e=c.getSymbol())||void 0===e?void 0:e.pricePrecision)&&void 0!==i?i:O,v=s.getAxisComponent(),y=c.getDataList(),m=y[y.length-1];if(f(m)){var _=m.close,x=m.open,b="current_open"===d.compareRule?x:null!==(o=null===(n=y[y.length-2])||void 0===n?void 0:n.close)&&void 0!==o?o:_,w=v.convertToNicePixel(_),C="";C=_>b?d.upColor:_<b?d.downColor:d.noChangeColor;var A=v.getRange(),M=v.displayValueToText(v.realValueToDisplayValue(v.valueToRealValue(_,{range:A}),{range:A}),g);M=c.getDecimalFold().format(c.getThousandsSeparator().format(M));var F=Math.max(9,(p.size||11)-1),R=p.family||"Rubik, sans-serif",wt=p.weight||"600";t.save(),t.font=wt+" "+F+"px "+R;var mw=t.measureText(M).width,pw=Math.round(mw+10),ph=Math.round(F+7),px=0,tl=0,tr=4,br=4,bl=0;v.isFromZero()?(px=Math.round(u.width-pw),tl=4,tr=0,br=0,bl=4):(px=0,tl=0,tr=4,br=4,bl=0);var py=Math.round(w-ph/2);t.beginPath(),typeof t.roundRect==="function"?t.roundRect(px,py,pw,ph,[tl,tr,br,bl]):(t.moveTo(px+tl,py),t.lineTo(px+pw-tr,py),tr>0&&t.arcTo(px+pw,py,px+pw,py+tr,tr),t.lineTo(px+pw,py+ph-br),br>0&&t.arcTo(px+pw,py+ph,px+pw-br,py+ph,br),t.lineTo(px+bl,py+ph),bl>0&&t.arcTo(px,py+ph,px,py+ph-bl,bl),t.lineTo(px,py+tl),tl>0&&t.arcTo(px,py,px+tl,py,tl)),t.closePath(),t.fillStyle=C,t.fill(),t.textAlign="center",t.textBaseline="middle",t.fillStyle="#ffffff",t.fillText(M,px+pw/2,py+ph/2);var W=c.getInnerFormatter().formatExtendText,ay=py,by=py+ph;d.extendTexts&&Array.isArray(d.extendTexts)&&d.extendTexts.forEach((function(e,i){var r=W({type:"last_price",data:m,index:i});if(r&&r.length>0&&e.show){var n=e.size||10;t.font=(e.weight||"normal")+" "+n+"px "+(e.family||R);var o=Math.round(t.measureText(r).width+8),s=Math.round(n+4),lx=v.isFromZero()?Math.round(u.width-o):0,etl=v.isFromZero()?3:0,etr=v.isFromZero()?0:3,ebr=v.isFromZero()?0:3,ebl=v.isFromZero()?3:0,a=0;"above_price"===e.position?(ay-=s+2,a=ay):(a=by+2,by+=s+2),t.beginPath(),typeof t.roundRect==="function"?t.roundRect(lx,a,o,s,[etl,etr,ebr,ebl]):t.rect(lx,a,o,s),t.closePath(),t.fillStyle=C,t.fill(),t.fillStyle="#ffffff",t.textAlign="center",t.textBaseline="middle",t.fillText(r,lx+o/2,a+s/2)}})),t.restore()}}}';
      const minPrevDrawImp1 = 'e.prototype.drawImp=function(t){var e,i,n,o,a=this,s=this.getWidget(),l=s.getPane(),u=s.getBounding(),c=l.getChart().getChartStore(),h=c.getStyles().candle.priceMark,d=h.last,p=d.text;if(h.show&&d.show&&p.show){var g=null!==(i=null===(e=c.getSymbol())||void 0===e?void 0:e.pricePrecision)&&void 0!==i?i:O,v=s.getAxisComponent(),y=c.getDataList(),m=y[y.length-1];if(f(m)){var _=m.close,x=m.open,b="current_open"===d.compareRule?x:null!==(o=null===(n=y[y.length-2])||void 0===n?void 0:n.close)&&void 0!==o?o:_,w=v.convertToNicePixel(_),C="";C=_>b?d.upColor:_<b?d.downColor:d.noChangeColor;var A=v.getRange(),M=v.displayValueToText(v.realValueToDisplayValue(v.valueToRealValue(_,{range:A}),{range:A}),g);M=c.getDecimalFold().format(c.getThousandsSeparator().format(M));var F=p.size||11,R=p.family||"Rubik, sans-serif",wt=p.weight||"600";t.save(),t.font=wt+" "+F+"px "+R;var mw=t.measureText(M).width,pw=Math.round(mw+12),ph=Math.round(F+8),px=0,tl=0,tr=4,br=4,bl=0;v.isFromZero()?(px=0,tl=0,tr=4,br=4,bl=0):(px=Math.round(u.width-pw),tl=4,tr=0,br=0,bl=4);var py=Math.round(w-ph/2);t.beginPath(),typeof t.roundRect==="function"?t.roundRect(px,py,pw,ph,[tl,tr,br,bl]):(t.moveTo(px+tl,py),t.lineTo(px+pw-tr,py),tr>0&&t.arcTo(px+pw,py,px+pw,py+tr,tr),t.lineTo(px+pw,py+ph-br),br>0&&t.arcTo(px+pw,py+ph,px+pw-br,py+ph,br),t.lineTo(px+bl,py+ph),bl>0&&t.arcTo(px,py+ph,px,py+ph-bl,bl),t.lineTo(px,py+tl),tl>0&&t.arcTo(px,py,px+tl,py,tl)),t.closePath(),t.fillStyle=C,t.fill(),t.textAlign="center",t.textBaseline="middle",t.fillStyle="#ffffff",t.fillText(M,px+pw/2,py+ph/2);var W=c.getInnerFormatter().formatExtendText,ay=py,by=py+ph;d.extendTexts&&Array.isArray(d.extendTexts)&&d.extendTexts.forEach((function(e,i){var r=W({type:"last_price",data:m,index:i});if(r&&r.length>0&&e.show){var n=e.size||10;t.font=(e.weight||"normal")+" "+n+"px "+(e.family||R);var o=Math.round(t.measureText(r).width+8),s=Math.round(n+4),lx=v.isFromZero()?0:Math.round(u.width-o),etl=v.isFromZero()?0:3,etr=v.isFromZero()?3:0,ebr=v.isFromZero()?3:0,ebl=v.isFromZero()?0:3,a=0;"above_price"===e.position?(ay-=s+2,a=ay):(a=by+2,by+=s+2),t.beginPath(),typeof t.roundRect==="function"?t.roundRect(lx,a,o,s,[etl,etr,ebr,ebl]):t.rect(lx,a,o,s),t.closePath(),t.fillStyle=C,t.fill(),t.fillStyle="#ffffff",t.textAlign="center",t.textBaseline="middle",t.fillText(r,lx+o/2,a+s/2)}})),t.restore()}}}';
      const minDrawImpReplacement = 'e.prototype.drawImp=function(t){var e,i,n,o,a=this,s=this.getWidget(),l=s.getPane(),u=s.getBounding(),c=l.getChart().getChartStore(),h=c.getStyles().candle.priceMark,d=h.last,p=d.text;if(h.show&&d.show&&p.show){var g=null!==(i=null===(e=c.getSymbol())||void 0===e?void 0:e.pricePrecision)&&void 0!==i?i:O,v=s.getAxisComponent(),y=c.getDataList(),m=y[y.length-1];if(f(m)){var _=m.close,x=m.open,b="current_open"===d.compareRule?x:null!==(o=null===(n=y[y.length-2])||void 0===n?void 0:n.close)&&void 0!==o?o:_,w=v.convertToNicePixel(_),C="";C=_>b?d.upColor:_<b?d.downColor:d.noChangeColor;var A=v.getRange(),M=v.displayValueToText(v.realValueToDisplayValue(v.valueToRealValue(_,{range:A}),{range:A}),g);M=c.getDecimalFold().format(c.getThousandsSeparator().format(M));var F=p.size||11,R=p.family||"Rubik, sans-serif",wt=p.weight||"600";t.save(),t.font=wt+" "+F+"px "+R;var pw=u.width,ph=Math.round(F+8),py=Math.round(w-ph/2);t.beginPath(),t.rect(0,py,pw,ph),t.closePath(),t.fillStyle=C,t.fill(),t.textAlign="center",t.textBaseline="middle",t.fillStyle="#ffffff",t.fillText(M,pw/2,py+ph/2);var W=c.getInnerFormatter().formatExtendText,ay=py,by=py+ph;d.extendTexts&&Array.isArray(d.extendTexts)&&d.extendTexts.forEach((function(e,i){var r=W({type:"last_price",data:m,index:i});if(r&&r.length>0&&e.show){var n=e.size||10;t.font=(e.weight||"normal")+" "+n+"px "+(e.family||R);var s=Math.round(n+4),a=0;"above_price"===e.position?(ay-=s+2,a=ay):(a=by+2,by+=s+2),t.beginPath(),t.rect(0,a,pw,s),t.closePath(),t.fillStyle=C,t.fill(),t.fillStyle="#ffffff",t.textAlign="center",t.textBaseline="middle",t.fillText(r,pw/2,a+s/2)}})),t.restore()}}}';

      if (content.includes(minDrawImpTarget)) {
        content = content.replace(minDrawImpTarget, minDrawImpReplacement);
        modified = true;
        console.log(`Successfully patched: CandleLastPriceLabelView full-width sharp design in ${fileName}`);
      } else if (content.includes(minPrevDrawImp3)) {
        content = content.replace(minPrevDrawImp3, minDrawImpReplacement);
        modified = true;
        console.log(`Successfully updated: CandleLastPriceLabelView full-width sharp design (+1pt text size) in ${fileName}`);
      } else if (content.includes(minPrevDrawImp2)) {
        content = content.replace(minPrevDrawImp2, minDrawImpReplacement);
        modified = true;
        console.log(`Successfully updated: CandleLastPriceLabelView full-width sharp design (+1pt text size) in ${fileName}`);
      } else if (content.includes(minPrevDrawImp1)) {
        content = content.replace(minPrevDrawImp1, minDrawImpReplacement);
        modified = true;
        console.log(`Successfully updated: CandleLastPriceLabelView full-width sharp design (+1pt text size) in ${fileName}`);
      }
      // 4.2. Patch ChartImp.prototype.setSymbol to clear _cacheYAxisWidth dynamically on symbol change
      const minSymbolTarget = 't.prototype.setSymbol=function(t){t!==this.getSymbol()&&(this._resetYAxisAutoCalcTickFlag(),this._chartStore.setSymbol(t))}';
      const minSymbolReplacement = 't.prototype.setSymbol=function(t){this._cacheYAxisWidth={left:0,right:0},this._resetYAxisAutoCalcTickFlag(),this._chartStore.setSymbol(t)}';
      const minPrevPatchedSymbol = 't.prototype.setSymbol=function(t){t!==this.getSymbol()&&(this._cacheYAxisWidth={left:0,right:0},this._resetYAxisAutoCalcTickFlag(),this._chartStore.setSymbol(t))}';
      if (content.includes(minSymbolTarget)) {
        content = content.split(minSymbolTarget).join(minSymbolReplacement);
        modified = true;
        console.log(`Successfully patched: ChartImp.prototype.setSymbol in ${fileName}`);
      } else if (content.includes(minPrevPatchedSymbol)) {
        content = content.split(minPrevPatchedSymbol).join(minSymbolReplacement);
        modified = true;
        console.log(`Successfully updated: ChartImp.prototype.setSymbol (force clear) in ${fileName}`);
      }
      // 4.3. Patch ChartImp.prototype._layout to reset _cacheYAxisWidth on symbol change
      const minLayoutTarget = 't.prototype._layout=function(){';
      const minLayoutReplacement = 't.prototype._layout=function(){var s_symbol=this.getSymbol(),s_ticker=s_symbol?s_symbol.ticker:"";this._lastLayoutTicker!==s_ticker&&(this._cacheYAxisWidth={left:0,right:0},this._lastLayoutTicker=s_ticker);';
      if (content.includes(minLayoutTarget) && !content.includes('s_symbol=this.getSymbol()')) {
        content = content.split(minLayoutTarget).join(minLayoutReplacement);
        modified = true;
        console.log(`Successfully patched: ChartImp.prototype._layout in ${fileName}`);
      }
      // 4.4. Patch StoreImp.prototype.setSymbol to prevent carrying over previous symbol's precision
      const minStoreSymbolTarget = 'e._symbol=T(T({pricePrecision:Z,volumePrecision:q},e._symbol),t)';
      const minStoreSymbolReplacement = 'e._symbol=(t&&!t.ticker&&e._symbol)?T(T({},e._symbol),t):T({pricePrecision:Z,volumePrecision:q},t)';
      if (content.includes(minStoreSymbolTarget)) {
        content = content.split(minStoreSymbolTarget).join(minStoreSymbolReplacement);
        modified = true;
        console.log(`Successfully patched: StoreImp.prototype.setSymbol in ${fileName}`);
      }
      // 4.5. Patch YAxis scaling to use smooth exponential scaling
      const minPrevScale3 = 'var ps=o.convertFromPixel(this._yAxisStartScaleDistance),pc=o.convertFromPixel(e.pageY),dp=ps-pc,nf=(null!=a.from?a.from:a.min)+dp,nt=(null!=a.to?a.to:a.max)+dp,rf=o.valueToRealValue(nf,{range:a}),rt=o.valueToRealValue(nt,{range:a}),df=o.realValueToDisplayValue(rf,{range:a}),dt=o.realValueToDisplayValue(rt,{range:a}),rv={from:nf,to:nt,range:nt-nf,realFrom:rf,realTo:rt,realRange:rt-rf,displayFrom:df,displayTo:dt,displayRange:dt-df};o.setAutoCalcTickFlag(!1),o._autoCalcTickFlag=!1,o.setRange(rv),o._range=rv,o._realRange=rv,this._chart.layout({measureWidth:!0,update:!0,buildYAxisTick:!0}),this._chart.updatePane(4),';
      const minPrevScale2 = 'var h=Math.max(100,t.getBounding()?t.getBounding().height:500),d=(e.pageY-this._yAxisStartScaleDistance);o.reverse&&(d=-d);var dr=(a.range*d)/h,nf=a.from+dr,nt=a.to+dr,rf=o.valueToRealValue(nf,{range:a}),rt=o.valueToRealValue(nt,{range:a}),df=o.realValueToDisplayValue(rf,{range:a}),dt=o.realValueToDisplayValue(rt,{range:a});o.setAutoCalcTickFlag(!1),o.setRange({from:nf,to:nt,range:nt-nf,realFrom:rf,realTo:rt,realRange:rt-rf,displayFrom:df,displayTo:dt,displayRange:dt-df}),this._chart.layout({measureWidth:!0,update:!0,buildYAxisTick:!0}),';
      const minPrevScale1 = 'var s=Math.max(0.01,Math.exp(((e.pageY-this._yAxisStartScaleDistance)/Math.max(100,t.getBounding()?t.getBounding().height:500))*1.8));this._zoomYAxis(o,s,a),';
      const minOrigScale = 'var s=e.pageY/this._yAxisStartScaleDistance;this._zoomYAxis(o,s,a),';
      const minScaleReplacement = 'var s=Math.max(0.01,Math.exp(((e.pageY-this._yAxisStartScaleDistance)/Math.max(100,t.getBounding()?t.getBounding().height:500))*1.8));this._zoomYAxis(o,s,a),';
      if (content.includes(minOrigScale)) {
        content = content.split(minOrigScale).join(minScaleReplacement);
        modified = true;
        console.log(`Successfully patched: YAxis scaling (smooth delta) in ${fileName}`);
      } else if (content.includes(minPrevScale3)) {
        content = content.split(minPrevScale3).join(minScaleReplacement);
        modified = true;
        console.log(`Successfully updated: YAxis scaling (smooth delta) in ${fileName}`);
      } else if (content.includes(minPrevScale2)) {
        content = content.split(minPrevScale2).join(minScaleReplacement);
        modified = true;
        console.log(`Successfully updated: YAxis scaling (smooth delta) in ${fileName}`);
      } else if (content.includes(minPrevScale1)) {
        content = content.split(minPrevScale1).join(minScaleReplacement);
        modified = true;
        console.log(`Successfully updated: YAxis scaling (smooth delta) in ${fileName}`);
      }
      // 4.6. Patch ChartImp.prototype.layout to eliminate Promise.resolve() microtask delay for 0ms lag drag & zoom
      const minLayoutPromisePattern = /this\._layoutPending\|\|\(this\._layoutPending=!0,Promise\.resolve\(\)\.then\(\(function\([^\)]+\)\{([a-zA-Z0-9$_]+)\._layout\(\),\1\._layoutPending=!1\}\)\)\.catch\(\(function\([^\)]+\)\{\}\)\)\)/;
      if (minLayoutPromisePattern.test(content)) {
        content = content.replace(minLayoutPromisePattern, 'this._layoutPending||(this._layoutPending=!0,$1._layout(),$1._layoutPending=!1)');
        modified = true;
        console.log(`Successfully patched: ChartImp.prototype.layout (synchronous zero-delay layout) in ${fileName}`);
      }
      // 5. Add UMD missing exports
      if (!content.includes('t.FormatDateType')) {
        const dummyExports = `
        t.FormatDateType = { XAxis: 'xAxis', Tooltip: 'tooltip', Crosshair: 'crosshair' };
        t.DomPosition = { Root: 'root', Main: 'main', YAxis: 'yAxis', XAxis: 'xAxis' };
        t.ActionType = { OnCommonDraw: 'onCommonDraw', OnDrawStart: 'onDrawStart', OnDrawing: 'onDrawing', OnDrawEnd: 'onDrawEnd', OnIndicatorChange: 'onIndicatorChange' };
        t.TooltipIconPosition = { Left: 'left', Middle: 'middle', Right: 'right' };
        `;
        content += dummyExports;
        modified = true;
        console.log(`Successfully appended missing UMD exports to ${fileName}`);
      }

    } else {
      // ESM and unminified UMD
      
      // 1. Shims and Interceptor for Init Options
      const initRegex = /function\s+init\(ds,\s*options\)\s*\{/;
      if (initRegex.test(content) && !content.includes('ChartImp.prototype.applyNewData')) {
        const shims = `
        StoreImp.prototype.getTimeScaleStore = function () {
            return this;
        };
        ChartImp.prototype.applyNewData = function (dataList, more, callback) {
            var anchorTs = this.__preserve_anchor_ts__ || this._chartStore.__preserve_anchor_ts__;
            if (!anchorTs && typeof window !== 'undefined' && window.__ACTIVE_DATAFEED__ && window.__ACTIVE_DATAFEED__.savedAnchorInfo) {
                anchorTs = window.__ACTIVE_DATAFEED__.savedAnchorInfo;
            }
            this._chartStore._processDataUnsubscribe();
            this._chartStore._loading = false;
            this._chartStore.__preserve_anchor_ts__ = anchorTs;
            this._chartStore.__latest_live_price__ = undefined;
            this._chartStore.__latest_live_data__ = undefined;
            this._chartStore.__latest_live_ticker__ = undefined;
            this.__latest_live_price__ = undefined;
            this.__latest_live_data__ = undefined;
            this.__latest_live_ticker__ = undefined;
            this._chartStore._addData(dataList, 'init', more);
            this._chartStore._calcIndicator(this._chartStore.getIndicatorsByFilter({}));
            this.layout({ update: true });
            if (typeof callback === 'function') callback();
        };
        ChartImp.prototype.updateData = function (data, callback) {
            this._chartStore._addData(data);
            this._chartStore._calcIndicator(this._chartStore.getIndicatorsByFilter({}));
            this.layout({ update: true });
            if (typeof callback === 'function') callback();
        };
        ChartImp.prototype.loadMore = function (loadMoreCallback) {
            this._loadMoreCallback = loadMoreCallback;
            var self = this;
            if (!this._dataLoaderSet) {
                this._chartStore._dataLoader = {
                    getBars: function (params) {
                        if (params.type === 'forward') {
                            if (typeof self._loadMoreCallback === 'function') {
                                self._applyMoreDataCallback = params.callback;
                                self._loadMoreCallback(params.timestamp);
                            } else {
                                params.callback([], { backward: false, forward: false });
                            }
                        } else {
                            params.callback([], { backward: false, forward: false });
                        }
                    }
                };
                this._dataLoaderSet = true;
            }
        };
        ChartImp.prototype.applyMoreData = function (dataList, more, callback) {
            if (typeof this._applyMoreDataCallback === 'function') {
                this._applyMoreDataCallback(dataList, { forward: more, backward: false });
                this._applyMoreDataCallback = null;
            } else {
                this._chartStore._addData(dataList, 'forward', more);
                this._chartStore._calcIndicator(this._chartStore.getIndicatorsByFilter({}));
                this.layout({ update: true });
            }
            if (typeof callback === 'function') callback();
        };
        ChartImp.prototype.setPriceVolumePrecision = function (pricePrecision, volumePrecision) {
            var currentSymbol = this.getSymbol ? this.getSymbol() : null;
            if (currentSymbol && currentSymbol.ticker) {
                var symbol = Object.assign({}, currentSymbol);
                symbol.pricePrecision = pricePrecision;
                symbol.volumePrecision = volumePrecision;
                this.setSymbol(symbol);
            }
        };
        ChartImp.prototype.getCustomApi = function () {
            var formatter = this.getFormatter();
            return {
                formatDate: function (dateTimeFormat, timestamp, template, type) {
                    if (formatter && typeof formatter.formatDate === 'function') {
                        return formatter.formatDate({ dateTimeFormat: dateTimeFormat, timestamp: timestamp, template: template, type: type });
                    }
                    return '';
                }
            };
        };
        ChartImp.prototype.setCustomApi = function (customApi) {
            if (customApi && typeof customApi.formatDate === 'function') {
                this.setFormatter({
                    formatDate: function (params) {
                        return customApi.formatDate(params.dateTimeFormat, params.timestamp, params.template, params.type);
                    }
                });
            }
        };
        var originalSetStyles_CI = ChartImp.prototype.setStyles;
        ChartImp.prototype.setStyles = function (value) {
            if (originalSetStyles_CI) originalSetStyles_CI.call(this, value);
            else this._chartStore.setStyles(value);
            if (value && value.yAxis) {
                var yAxisOpts = {};
                var hasUpdate = false;
                if (value.yAxis.type !== undefined) {
                    yAxisOpts.name = value.yAxis.type === 'log' ? 'logarithm' : (value.yAxis.type || 'normal');
                    hasUpdate = true;
                }
                if (value.yAxis.reverse !== undefined) {
                    yAxisOpts.reverse = !!value.yAxis.reverse;
                    hasUpdate = true;
                }
                if (hasUpdate) {
                    yAxisOpts.paneId = 'candle_pane';
                    this.overrideYAxis(yAxisOpts);
                }
            }
        };
        var origCreateIndicator_CI = ChartImp.prototype.createIndicator;
        ChartImp.prototype.createIndicator = function (value, isStack, paneOptions) {
            if (typeof value === 'string' && paneOptions && paneOptions.id) {
                return origCreateIndicator_CI.call(this, { name: value, paneId: paneOptions.id }, isStack);
            }
            return origCreateIndicator_CI.apply(this, arguments);
        };
        var origRemoveIndicator_CI = ChartImp.prototype.removeIndicator;
        ChartImp.prototype.removeIndicator = function (paneIdOrFilter, name) {
            if (typeof paneIdOrFilter === 'string' && typeof name === 'string') {
                return origRemoveIndicator_CI.call(this, { paneId: paneIdOrFilter, name: name });
            }
            return origRemoveIndicator_CI.apply(this, arguments);
        };
        ChartImp.prototype.getIndicatorByPaneId = function () {
            var indicators = this.getIndicators ? this.getIndicators({}) : [];
            var result = new Map();
            for (var i = 0; i < indicators.length; i++) {
                var ind = indicators[i];
                var pId = ind.paneId;
                if (!result.has(pId)) result.set(pId, new Map());
                result.get(pId).set(ind.name, ind);
            }
            return result;
        };

        function init(ds, options) {
            if (options && options.customApi) {
                options.formatter = options.formatter || {};
                if (options.customApi.formatDate) {
                    var originalFormatDate = options.customApi.formatDate;
                    options.formatter.formatDate = function (params) {
                        return originalFormatDate(params.dateTimeFormat, params.timestamp, params.template, params.type);
                    };
                }
            }
        `;
        content = content.replace(initRegex, shims);
        modified = true;
        console.log(`Successfully patched: Init options shims in ${fileName}`);
      }
      // 1b. Additional shims for v10 API compatibility (getIndicatorByPaneId, createIndicator 3-arg, removeIndicator 2-arg)
      if (!content.includes('ChartImp.prototype.getIndicatorByPaneId')) {
        const newShims = `
        StoreImp.prototype.getTimeScaleStore = function () {
            return this;
        };
        StoreImp.prototype.setLastBarRightSideDiffBarCount = function (barCount) {
            this._lastBarRightSideDiffBarCount = barCount;
            this._offsetRightDistance = barCount * (this._barSpace || 6);
        };
        ChartImp.prototype.setOffsetRightDistance = function (distance, isUpdate) {
            return this._chartStore.setOffsetRightDistance(distance, isUpdate);
        };
        ChartImp.prototype.getOffsetRightDistance = function () {
            return this._chartStore.getOffsetRightDistance();
        };
        ChartImp.prototype.setLastBarRightSideDiffBarCount = function (barCount) {
            this._chartStore.setLastBarRightSideDiffBarCount(barCount);
            if (typeof this._chartStore._adjustVisibleRange === 'function') {
                this._chartStore._adjustVisibleRange();
            }
            this.layout({ measureWidth: true, update: true, buildYAxisTick: true });
        };
        ChartImp.prototype.getLastBarRightSideDiffBarCount = function () {
            return this._chartStore.getLastBarRightSideDiffBarCount();
        };
        ChartImp.prototype.loadMore = function (loadMoreCallback) {
            this._loadMoreCallback = loadMoreCallback;
            var self = this;
            if (!this._dataLoaderSet) {
                this._chartStore._dataLoader = {
                    getBars: function (params) {
                        if (params.type === 'forward') {
                            if (typeof self._loadMoreCallback === 'function') {
                                self._applyMoreDataCallback = params.callback;
                                self._loadMoreCallback(params.timestamp);
                            } else {
                                params.callback([], { backward: false, forward: false });
                            }
                        } else {
                            params.callback([], { backward: false, forward: false });
                        }
                    }
                };
                this._dataLoaderSet = true;
            }
        };
        ChartImp.prototype.applyMoreData = function (dataList, more, callback) {
            if (typeof this._applyMoreDataCallback === 'function') {
                this._applyMoreDataCallback(dataList, { forward: more, backward: false });
                this._applyMoreDataCallback = null;
            } else {
                this._chartStore._addData(dataList, 'forward', more);
                this._chartStore._calcIndicator(this._chartStore.getIndicatorsByFilter({}));
                this.layout({ update: true });
            }
            if (typeof callback === 'function') callback();
        };
        ChartImp.prototype.setPriceVolumePrecision = function (pricePrecision, volumePrecision) {
            var currentSymbol = this.getSymbol ? this.getSymbol() : null;
            var symbol = currentSymbol ? Object.assign({}, currentSymbol) : { ticker: '' };
            symbol.pricePrecision = pricePrecision;
            symbol.volumePrecision = volumePrecision;
            this.setSymbol(symbol);
        };
        var origCreateIndicator_CI = ChartImp.prototype.createIndicator;
        ChartImp.prototype.createIndicator = function (value, isStack, paneOptions) {
            if (typeof value === 'string' && paneOptions && paneOptions.id) {
                return origCreateIndicator_CI.call(this, { name: value, paneId: paneOptions.id }, isStack);
            }
            return origCreateIndicator_CI.apply(this, arguments);
        };
        var origRemoveIndicator_CI = ChartImp.prototype.removeIndicator;
        ChartImp.prototype.removeIndicator = function (paneIdOrFilter, name) {
            if (typeof paneIdOrFilter === 'string' && typeof name === 'string') {
                return origRemoveIndicator_CI.call(this, { paneId: paneIdOrFilter, name: name });
            }
            return origRemoveIndicator_CI.apply(this, arguments);
        };
        ChartImp.prototype.getIndicatorByPaneId = function () {
            var indicators = this.getIndicators ? this.getIndicators({}) : [];
            var result = new Map();
            for (var i = 0; i < indicators.length; i++) {
                var ind = indicators[i];
                var pId = ind.paneId;
                if (!result.has(pId)) result.set(pId, new Map());
                result.get(pId).set(ind.name, ind);
            }
            return result;
        };
        `;
        // Insert the new shims right before the init function
        const insertPoint = content.indexOf('function init(ds, options)');
        if (insertPoint !== -1) {
          content = content.slice(0, insertPoint) + newShims + '\n' + content.slice(insertPoint);
          modified = true;
          console.log(`Successfully patched: v10 API shims (getIndicatorByPaneId, createIndicator, removeIndicator) in ${fileName}`);
        }
      }


      const tooltipLegendsRegex = /tooltipData\.legends\s*=\s*legends;\s*\}\s*if\s*\(isFunction\(indicator\.createTooltipDataSource\)\)/;
      if (tooltipLegendsRegex.test(content) && !content.includes('__status_indicator_values__')) {
        content = content.replace(tooltipLegendsRegex, `tooltipData.legends = legends;
            }
            if (typeof window !== 'undefined' && window.__status_indicator_values__ === false) {
                tooltipData.legends = [];
            }
            if (isFunction(indicator.createTooltipDataSource))`);
        modified = true;
        console.log(`Successfully patched: IndicatorTooltipView.legends in ${fileName}`);
      }

      // 3. Patch lastValueMark to skip figures with noRange: true
      const lastValueMarkRegex = /eachFigures\(indicator,\s*dataIndex_1,\s*barSpace_1,\s*defaultStyles,\s*function\s*\(figure,\s*figureStyles\)\s*\{([\s\S]*?var\s+value\s*=\s*data\[figure\.key\];[\s\S]*?)if\s*\(isNumber\(value\)\)\s*\{/;
      if (lastValueMarkRegex.test(content) && !content.includes('figure.noRange !== true')) {
        content = content.replace(lastValueMarkRegex, `eachFigures(indicator, dataIndex_1, barSpace_1, defaultStyles, function (figure, figureStyles) {$1if (figure.noRange !== true && isNumber(value)) {`);
        modified = true;
        console.log(`Successfully patched: lastValueMark noRange skip in ${fileName}`);
      }

      // 4. Patch optimalTicks grid density
      const gridDensityRegex = /var\s+tickTextWidth\s*=\s*Math\.max\(calcTextWidth\('YYYY-MM-DD\s+HH:mm:ss',\s*textStyles\.size,\s*textStyles\.weight,\s*textStyles\.family\),\s*this\.getBounding\(\)\.width\s*\/\s*TICK_COUNT\);/;
      if (gridDensityRegex.test(content) && !content.includes('TICK_COUNT) * 0.70;')) {
        content = content.replace(gridDensityRegex, `var tickTextWidth = Math.max(calcTextWidth('YYYY-MM-DD HH:mm:ss', textStyles.size, textStyles.weight, textStyles.family), this.getBounding().width / TICK_COUNT) * 0.70;`);
        modified = true;
        console.log(`Successfully patched: XAxis grid density in ${fileName}`);
      }
      // 4.1. Patch YAxisWidget update rendering order to bring the live price label to the absolute foreground (on top of drawings)
      const targetStr = `    YAxisWidget.prototype.updateMain = function (ctx) {
        this._yAxisView.draw(ctx);
        var pane = this.getPane();
        var isCandleLastPriceLabelVisibleYAxis = pane.isDefaultYAxis(this._yAxis.id) || pane.isManualYAxis(this._yAxis.id);
        if (isCandleLastPriceLabelVisibleYAxis && this.getAxisComponent().isInCandle()) {
            this._candleLastPriceLabelView.draw(ctx);
        }
        this._indicatorLastValueView.draw(ctx);
    };
    YAxisWidget.prototype.updateOverlay = function (ctx) {
        this._overlayYAxisView.draw(ctx);
        this._crosshairHorizontalLabelView.draw(ctx);
    };`;

      const prevPatchedStr = `    YAxisWidget.prototype.updateMain = function (ctx) {
        this._yAxisView.draw(ctx);
        this._indicatorLastValueView.draw(ctx);
    };
    YAxisWidget.prototype.updateOverlay = function (ctx) {
        var pane = this.getPane();
        var isCandleLastPriceLabelVisibleYAxis = pane.isDefaultYAxis(this._yAxis.id) || pane.isManualYAxis(this._yAxis.id);
        if (isCandleLastPriceLabelVisibleYAxis && this.getAxisComponent().isInCandle()) {
            this._candleLastPriceLabelView.draw(ctx);
        }
        this._overlayYAxisView.draw(ctx);
        this._crosshairHorizontalLabelView.draw(ctx);
    };`;

      const replacementStr = `    YAxisWidget.prototype.updateMain = function (ctx) {
        this._yAxisView.draw(ctx);
        this._indicatorLastValueView.draw(ctx);
    };
    YAxisWidget.prototype.updateOverlay = function (ctx) {
        this._overlayYAxisView.draw(ctx);
        this._crosshairHorizontalLabelView.draw(ctx);
        var pane = this.getPane();
        var isCandleLastPriceLabelVisibleYAxis = pane.isDefaultYAxis(this._yAxis.id) || pane.isManualYAxis(this._yAxis.id);
        if (isCandleLastPriceLabelVisibleYAxis && this.getAxisComponent().isInCandle()) {
            this._candleLastPriceLabelView.draw(ctx);
        }
    };`;

      if (content.includes(targetStr)) {
        content = content.replace(targetStr, replacementStr);
        modified = true;
        console.log(`Successfully patched: YAxisWidget updateMain/updateOverlay drawing order in ${fileName}`);
      } else if (content.includes(prevPatchedStr)) {
        content = content.replace(prevPatchedStr, replacementStr);
        modified = true;
        console.log(`Successfully updated: YAxisWidget updateMain/updateOverlay drawing order (from previous patch) in ${fileName}`);
      }

      // 4.1b. Patch CandleLastPriceLabelView.prototype.drawImp for compact rounded pill badge design
      const esmDrawImpTarget = `    CandleLastPriceLabelView.prototype.drawImp = function (ctx) {
        var _this = this;
        var _a, _b, _c, _d;
        var widget = this.getWidget();
        var pane = widget.getPane();
        var bounding = widget.getBounding();
        var chartStore = pane.getChart().getChartStore();
        var priceMarkStyles = chartStore.getStyles().candle.priceMark;
        var lastPriceMarkStyles = priceMarkStyles.last;
        var lastPriceMarkTextStyles = lastPriceMarkStyles.text;
        if (priceMarkStyles.show && lastPriceMarkStyles.show && lastPriceMarkTextStyles.show) {
            var precision = (_b = (_a = chartStore.getSymbol()) === null || _a === void 0 ? void 0 : _a.pricePrecision) !== null && _b !== void 0 ? _b : SymbolDefaultPrecisionConstants.PRICE;
            var yAxis = widget.getAxisComponent();
            var dataList = chartStore.getDataList();
            var data_1 = dataList[dataList.length - 1];
            if (isValid(data_1)) {
                var close_1 = data_1.close, open_1 = data_1.open;
                var comparePrice = lastPriceMarkStyles.compareRule === 'current_open' ? open_1 : ((_d = (_c = dataList[dataList.length - 2]) === null || _c === void 0 ? void 0 : _c.close) !== null && _d !== void 0 ? _d : close_1);
                var priceY = yAxis.convertToNicePixel(close_1);
                var backgroundColor_1 = '';
                if (close_1 > comparePrice) {
                    backgroundColor_1 = lastPriceMarkStyles.upColor;
                }
                else if (close_1 < comparePrice) {
                    backgroundColor_1 = lastPriceMarkStyles.downColor;
                }
                else {
                    backgroundColor_1 = lastPriceMarkStyles.noChangeColor;
                }
                var x_1 = 0;
                var textAlgin_1 = 'left';
                if (yAxis.isFromZero()) {
                    x_1 = 0;
                    textAlgin_1 = 'left';
                }
                else {
                    x_1 = bounding.width;
                    textAlgin_1 = 'right';
                }
                var textFigures_1 = [];
                var yAxisRange = yAxis.getRange();
                var priceText = yAxis.displayValueToText(yAxis.realValueToDisplayValue(yAxis.valueToRealValue(close_1, { range: yAxisRange }), { range: yAxisRange }), precision);
                priceText = chartStore.getDecimalFold().format(chartStore.getThousandsSeparator().format(priceText));
                var paddingLeft = lastPriceMarkTextStyles.paddingLeft, paddingRight = lastPriceMarkTextStyles.paddingRight, paddingTop = lastPriceMarkTextStyles.paddingTop, paddingBottom = lastPriceMarkTextStyles.paddingBottom, size = lastPriceMarkTextStyles.size, family = lastPriceMarkTextStyles.family, weight = lastPriceMarkTextStyles.weight;
                var textWidth_1 = paddingLeft + calcTextWidth(priceText, size, weight, family) + paddingRight;
                var priceTextHeight = paddingTop + size + paddingBottom;
                textFigures_1.push({
                    name: 'text',
                    attrs: {
                        x: x_1,
                        y: priceY,
                        width: textWidth_1,
                        height: priceTextHeight,
                        text: priceText,
                        align: textAlgin_1,
                        baseline: 'middle'
                    },
                    styles: __assign(__assign({}, lastPriceMarkTextStyles), { backgroundColor: backgroundColor_1 })
                });
                var formatExtendText_1 = chartStore.getInnerFormatter().formatExtendText;
                var priceTextHalfHeight = size / 2;
                var aboveY_1 = priceY - priceTextHalfHeight - paddingTop;
                var belowY_1 = priceY + priceTextHalfHeight + paddingBottom;
                lastPriceMarkStyles.extendTexts.forEach(function (item, index) {
                    var text = formatExtendText_1({ type: 'last_price', data: data_1, index: index });
                    if (text.length > 0 && item.show) {
                        var textHalfHeight = item.size / 2;
                        var textY = 0;
                        if (item.position === 'above_price') {
                            aboveY_1 -= item.paddingBottom + textHalfHeight;
                            textY = aboveY_1;
                            aboveY_1 -= textHalfHeight + item.paddingTop;
                        }
                        else {
                            belowY_1 += item.paddingTop + textHalfHeight;
                            textY = belowY_1;
                            belowY_1 += textHalfHeight + item.paddingBottom;
                        }
                        textWidth_1 = Math.max(textWidth_1, item.paddingLeft + calcTextWidth(text, item.size, item.weight, item.family) + item.paddingRight);
                        textFigures_1.push({
                            name: 'text',
                            attrs: {
                                x: x_1,
                                y: textY,
                                width: textWidth_1,
                                height: item.paddingTop + item.size + item.paddingBottom,
                                text: text,
                                align: textAlgin_1,
                                baseline: 'middle'
                            },
                            styles: __assign(__assign({}, item), { backgroundColor: backgroundColor_1 })
                        });
                    }
                });
                textFigures_1.forEach(function (figure) {
                    var _a;
                    figure.attrs.width = textWidth_1;
                    (_a = _this.createFigure(figure)) === null || _a === void 0 ? void 0 : _a.draw(ctx);
                });
            }
        }
    };`;

      const esmDrawImpReplacement = `    CandleLastPriceLabelView.prototype.drawImp = function (ctx) {
        var _a, _b, _c, _d;
        var widget = this.getWidget();
        var pane = widget.getPane();
        var bounding = widget.getBounding();
        var chartStore = pane.getChart().getChartStore();
        var priceMarkStyles = chartStore.getStyles().candle.priceMark;
        var lastPriceMarkStyles = priceMarkStyles.last;
        var lastPriceMarkTextStyles = lastPriceMarkStyles.text;
        if (priceMarkStyles.show && lastPriceMarkStyles.show && lastPriceMarkTextStyles.show) {
            var precision = (_b = (_a = chartStore.getSymbol()) === null || _a === void 0 ? void 0 : _a.pricePrecision) !== null && _b !== void 0 ? _b : SymbolDefaultPrecisionConstants.PRICE;
            var yAxis = widget.getAxisComponent();
            var dataList = chartStore.getDataList();
            var data_1 = dataList[dataList.length - 1];
            if (isValid(data_1)) {
                var close_1 = data_1.close, open_1 = data_1.open;
                var comparePrice = lastPriceMarkStyles.compareRule === 'current_open' ? open_1 : ((_d = (_c = dataList[dataList.length - 2]) === null || _c === void 0 ? void 0 : _c.close) !== null && _d !== void 0 ? _d : close_1);
                var priceY = yAxis.convertToNicePixel(close_1);
                var backgroundColor_1 = '';
                if (close_1 > comparePrice) {
                    backgroundColor_1 = lastPriceMarkStyles.upColor || '#089981';
                }
                else if (close_1 < comparePrice) {
                    backgroundColor_1 = lastPriceMarkStyles.downColor || '#f23645';
                }
                else {
                    backgroundColor_1 = lastPriceMarkStyles.noChangeColor || '#868993';
                }
                var yAxisRange = yAxis.getRange();
                var priceText = yAxis.displayValueToText(yAxis.realValueToDisplayValue(yAxis.valueToRealValue(close_1, { range: yAxisRange }), { range: yAxisRange }), precision);
                priceText = chartStore.getDecimalFold().format(chartStore.getThousandsSeparator().format(priceText));
                var fontSize = lastPriceMarkTextStyles.size || 11;
                var fontFamily = lastPriceMarkTextStyles.family || 'Rubik, sans-serif';
                var fontWeight = lastPriceMarkTextStyles.weight || '600';

                ctx.save();
                ctx.font = fontWeight + ' ' + fontSize + 'px ' + fontFamily;
                var pillWidth = bounding.width;
                var pillHeight = Math.round(fontSize + 8);
                var pillY = Math.round(priceY - pillHeight / 2);

                ctx.beginPath();
                ctx.rect(0, pillY, pillWidth, pillHeight);
                ctx.closePath();
                ctx.fillStyle = backgroundColor_1;
                ctx.fill();

                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = '#ffffff';
                ctx.fillText(priceText, pillWidth / 2, pillY + pillHeight / 2);

                var formatExtendText_1 = chartStore.getInnerFormatter().formatExtendText;
                var aboveY_1 = pillY;
                var belowY_1 = pillY + pillHeight;
                if (lastPriceMarkStyles.extendTexts && Array.isArray(lastPriceMarkStyles.extendTexts)) {
                    lastPriceMarkStyles.extendTexts.forEach(function (item, index) {
                        var text = formatExtendText_1({ type: 'last_price', data: data_1, index: index });
                        if (text && text.length > 0 && item.show) {
                            var extSize = item.size || 10;
                            ctx.font = (item.weight || 'normal') + ' ' + extSize + 'px ' + (item.family || fontFamily);
                            var extH = Math.round(extSize + 4);
                            var extY = 0;
                            if (item.position === 'above_price') {
                                aboveY_1 -= extH + 2;
                                extY = aboveY_1;
                            } else {
                                extY = belowY_1 + 2;
                                belowY_1 += extH + 2;
                            }
                            ctx.beginPath();
                            ctx.rect(0, extY, pillWidth, extH);
                            ctx.closePath();
                            ctx.fillStyle = backgroundColor_1;
                            ctx.fill();
                            ctx.fillStyle = '#ffffff';
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillText(text, pillWidth / 2, extY + extH / 2);
                        }
                    });
                }
                ctx.restore();
            }
        }
    };`;

      const prevEsmDrawImpPattern = 'var pillX = yAxis.isFromZero() ? 3 : Math.round(bounding.width - pillWidth - 3);';
      const prevEsmDrawImpPattern2 = 'pillX = Math.round(bounding.width - pillWidth);';
      const prevEsmDrawImpPattern3 = 'var fontSize = Math.max(9, (lastPriceMarkTextStyles.size || 11) - 1);';
      const prevEsmDrawImpPattern4 = 'var padV = 2.5;';
      if (content.includes(esmDrawImpTarget)) {
        content = content.replace(esmDrawImpTarget, esmDrawImpReplacement);
        modified = true;
        console.log(`Successfully patched: CandleLastPriceLabelView full-width sharp design in ${fileName}`);
      } else if (content.includes(prevEsmDrawImpPattern3)) {
        const esmRegex = /CandleLastPriceLabelView\.prototype\.drawImp\s*=\s*function\s*\(ctx\)\s*\{[\s\S]*?var\s+formatExtendText_1[\s\S]*?ctx\.restore\(\);\s*\}\s*\}\s*\};/;
        if (esmRegex.test(content)) {
          content = content.replace(esmRegex, esmDrawImpReplacement.trim());
          modified = true;
          console.log(`Successfully updated: CandleLastPriceLabelView full-width sharp design (+1pt text size) in ${fileName}`);
        }
      } else if (content.includes(prevEsmDrawImpPattern4)) {
        const esmRegex = /CandleLastPriceLabelView\.prototype\.drawImp\s*=\s*function\s*\(ctx\)\s*\{[\s\S]*?var\s+formatExtendText_1[\s\S]*?ctx\.restore\(\);\s*\}\s*\}\s*\};/;
        if (esmRegex.test(content)) {
          content = content.replace(esmRegex, esmDrawImpReplacement.trim());
          modified = true;
          console.log(`Successfully updated: CandleLastPriceLabelView full-width sharp design in ${fileName}`);
        }
      } else if (content.includes(prevEsmDrawImpPattern2)) {
        const esmRegex = /CandleLastPriceLabelView\.prototype\.drawImp\s*=\s*function\s*\(ctx\)\s*\{[\s\S]*?var\s+formatExtendText_1[\s\S]*?ctx\.restore\(\);\s*\}\s*\}\s*\};/;
        if (esmRegex.test(content)) {
          content = content.replace(esmRegex, esmDrawImpReplacement.trim());
          modified = true;
          console.log(`Successfully updated: CandleLastPriceLabelView full-width sharp design in ${fileName}`);
        }
      } else if (content.includes(prevEsmDrawImpPattern)) {
        const esmRegex = /CandleLastPriceLabelView\.prototype\.drawImp\s*=\s*function\s*\(ctx\)\s*\{[\s\S]*?var\s+formatExtendText_1[\s\S]*?ctx\.restore\(\);\s*\}\s*\}\s*\};/;
        if (esmRegex.test(content)) {
          content = content.replace(esmRegex, esmDrawImpReplacement.trim());
          modified = true;
          console.log(`Successfully updated: CandleLastPriceLabelView full-width sharp design in ${fileName}`);
        }
      } else if (content.includes(prevEsmDrawImpPattern)) {
        const esmRegex = /CandleLastPriceLabelView\.prototype\.drawImp\s*=\s*function\s*\(ctx\)\s*\{[\s\S]*?var\s+formatExtendText_1[\s\S]*?ctx\.restore\(\);\s*\}\s*\}\s*\};/;
        if (esmRegex.test(content)) {
          content = content.replace(esmRegex, esmDrawImpReplacement.trim());
          modified = true;
          console.log(`Successfully updated: CandleLastPriceLabelView full-width sharp design in ${fileName}`);
        }
      }

      // 4.2. Patch ChartImp.prototype.setSymbol to clear _cacheYAxisWidth dynamically on symbol change
      const esmSymbolRegex = /ChartImp\.prototype\.setSymbol\s*=\s*function\s*\(symbol\)\s*\{\s*if\s*\(symbol\s*!==\s*this\.getSymbol\(\)\)\s*\{\s*this\._resetYAxisAutoCalcTickFlag\(\);\s*this\._chartStore\.setSymbol\(symbol\);\s*\}\s*\};/;
      const esmPrevPatchedRegex = /ChartImp\.prototype\.setSymbol\s*=\s*function\s*\(symbol\)\s*\{\s*if\s*\(symbol\s*!==\s*this\.getSymbol\(\)\)\s*\{\s*this\._cacheYAxisWidth\s*=\s*\{\s*left\s*:\s*0,\s*right\s*:\s*0\s*\};\s*this\._resetYAxisAutoCalcTickFlag\(\);\s*this\._chartStore\.setSymbol\(symbol\);\s*\}\s*\};/;

      const replacementSymbolStr = `ChartImp.prototype.setSymbol = function (symbol) {
    this._cacheYAxisWidth = { left: 0, right: 0 };
    this._resetYAxisAutoCalcTickFlag();
    this._chartStore.setSymbol(symbol);
};`;
      if (esmSymbolRegex.test(content)) {
        content = content.replace(esmSymbolRegex, replacementSymbolStr);
        modified = true;
        console.log(`Successfully patched: ChartImp.prototype.setSymbol in ${fileName}`);
      } else if (esmPrevPatchedRegex.test(content)) {
        content = content.replace(esmPrevPatchedRegex, replacementSymbolStr);
        modified = true;
        console.log(`Successfully updated: ChartImp.prototype.setSymbol (force clear) in ${fileName}`);
      }

      // 4.3. Patch ChartImp.prototype._layout to reset _cacheYAxisWidth on symbol change
      const esmLayoutRegex = /ChartImp\.prototype\._layout\s*=\s*function\s*\(\)\s*\{\s*var\s+_this\s*=\s*this;/;
      const esmLayoutReplacement = `ChartImp.prototype._layout = function () {
    var symbol = this.getSymbol();
    var ticker = symbol ? symbol.ticker : '';
    if (this._lastLayoutTicker !== ticker) {
        this._cacheYAxisWidth = { left: 0, right: 0 };
        this._lastLayoutTicker = ticker;
    }
    var _this = this;`;

      if (esmLayoutRegex.test(content) && !content.includes('var symbol = this.getSymbol();')) {
        content = content.replace(esmLayoutRegex, esmLayoutReplacement);
        modified = true;
        console.log(`Successfully patched: ChartImp.prototype._layout in ${fileName}`);
      }

      // 4.4. Patch StoreImp.prototype.setSymbol to prevent carrying over previous symbol's precision
      const esmStoreSymbolRegex = /_this\._symbol\s*=\s*__assign\(\s*__assign\(\{\s*pricePrecision\s*:\s*SymbolDefaultPrecisionConstants\.PRICE,\s*volumePrecision\s*:\s*SymbolDefaultPrecisionConstants\.VOLUME\s*\},\s*_this\._symbol\),\s*symbol\);/;
      const esmStoreSymbolReplacement = `if (symbol && !symbol.ticker && _this._symbol) {
        _this._symbol = __assign(__assign({}, _this._symbol), symbol);
    } else {
        _this._symbol = __assign({ pricePrecision: SymbolDefaultPrecisionConstants.PRICE, volumePrecision: SymbolDefaultPrecisionConstants.VOLUME }, symbol);
    }`;

      if (esmStoreSymbolRegex.test(content)) {
        content = content.replace(esmStoreSymbolRegex, esmStoreSymbolReplacement);
        modified = true;
        console.log(`Successfully patched: StoreImp.prototype.setSymbol in ${fileName}`);
      }

      // 4.5. Patch YAxis scaling to use smooth exponential delta scaling instead of abrupt pageY division
      const esmOrigScaleTarget = 'var scaleFactor = event.pageY / this._yAxisStartScaleDistance;\n                this._zoomYAxis(targetYAxis, scaleFactor, prevYAxisRange);';
      const esmPrevScaleTarget2 = 'var bounding = widget.getBounding(); var height = (bounding && bounding.height > 0) ? bounding.height : 500; var distance = (event.pageY - this._yAxisStartScaleDistance); if (targetYAxis.reverse) distance = -distance; var from = prevYAxisRange.from, to = prevYAxisRange.to, range = prevYAxisRange.range; var difRange = (range * distance) / height; var newFrom = from + difRange; var newTo = to + difRange; var newRealFrom = targetYAxis.valueToRealValue(newFrom, { range: prevYAxisRange }); var newRealTo = targetYAxis.valueToRealValue(newTo, { range: prevYAxisRange }); var newDisplayFrom = targetYAxis.realValueToDisplayValue(newRealFrom, { range: prevYAxisRange }); var newDisplayTo = targetYAxis.realValueToDisplayValue(newRealTo, { range: prevYAxisRange }); targetYAxis.setAutoCalcTickFlag(false); targetYAxis.setRange({ from: newFrom, to: newTo, range: newTo - newFrom, realFrom: newRealFrom, realTo: newRealTo, realRange: newRealTo - newRealFrom, displayFrom: newDisplayFrom, displayTo: newDisplayTo, displayRange: newDisplayTo - newDisplayFrom }); this._chart.layout({ measureWidth: true, update: true, buildYAxisTick: true });';
      const esmPrevScaleTarget3 = 'var pStart = typeof targetYAxis.convertFromPixel === "function" ? targetYAxis.convertFromPixel(this._yAxisStartScaleDistance) : 0; var pCurrent = typeof targetYAxis.convertFromPixel === "function" ? targetYAxis.convertFromPixel(event.pageY) : 0; var dp = pStart - pCurrent; var newFrom = (prevYAxisRange.from !== undefined ? prevYAxisRange.from : prevYAxisRange.min) + dp; var newTo = (prevYAxisRange.to !== undefined ? prevYAxisRange.to : prevYAxisRange.max) + dp; var realFrom = typeof targetYAxis.valueToRealValue === "function" ? targetYAxis.valueToRealValue(newFrom, { range: prevYAxisRange }) : newFrom; var realTo = typeof targetYAxis.valueToRealValue === "function" ? targetYAxis.valueToRealValue(newTo, { range: prevYAxisRange }) : newTo; var displayFrom = typeof targetYAxis.realValueToDisplayValue === "function" ? targetYAxis.realValueToDisplayValue(realFrom, { range: prevYAxisRange }) : realFrom; var displayTo = typeof targetYAxis.realValueToDisplayValue === "function" ? targetYAxis.realValueToDisplayValue(realTo, { range: prevYAxisRange }) : realTo; targetYAxis.setAutoCalcTickFlag(false); (targetYAxis)._autoCalcTickFlag = false; var rangeVal = { from: newFrom, to: newTo, range: newTo - newFrom, realFrom: realFrom, realTo: realTo, realRange: realTo - realFrom, displayFrom: displayFrom, displayTo: displayTo, displayRange: displayTo - displayFrom }; if (typeof targetYAxis.setRange === "function") { targetYAxis.setRange(rangeVal); } (targetYAxis)._range = rangeVal; (targetYAxis)._realRange = rangeVal; this._chart.layout({ measureWidth: true, update: true, buildYAxisTick: true }); if (typeof this._chart.updatePane === "function") { this._chart.updatePane(4); }';
      const esmScaleReplacement = 'var deltaY = event.pageY - this._yAxisStartScaleDistance; var bounding = widget.getBounding(); var height = (bounding && bounding.height > 0) ? bounding.height : 500; var scaleFactor = Math.max(0.01, Math.exp((deltaY / height) * 1.8));\n                this._zoomYAxis(targetYAxis, scaleFactor, prevYAxisRange);';
      if (content.includes(esmOrigScaleTarget)) {
        content = content.replace(esmOrigScaleTarget, esmScaleReplacement);
        modified = true;
        console.log(`Successfully patched: YAxis scaling (smooth delta) in ${fileName}`);
      } else if (content.includes(esmPrevScaleTarget3)) {
        content = content.replace(esmPrevScaleTarget3, esmScaleReplacement);
        modified = true;
        console.log(`Successfully updated: YAxis scaling (smooth delta) in ${fileName}`);
      } else if (content.includes(esmPrevScaleTarget2)) {
        content = content.replace(esmPrevScaleTarget2, esmScaleReplacement);
        modified = true;
        console.log(`Successfully updated: YAxis scaling (smooth delta) in ${fileName}`);
      }

      // 4.6. Patch StoreImp constructor _period initialization
      const dynamicPeriodSearch1H = "this._period = (function(){ try { var saved = localStorage.getItem('chart_selected_period'); if (saved) { var parsed = JSON.parse(saved); if (parsed && typeof parsed.multiplier === 'number' && parsed.timespan) return parsed; } } catch(e){} return { multiplier: 1, timespan: 'hour', text: '1H' }; })();";
      const dynamicPeriodReplacement15m = "this._period = (function(){ try { var saved = localStorage.getItem('chart_selected_period'); if (saved) { var parsed = JSON.parse(saved); if (parsed && typeof parsed.multiplier === 'number' && parsed.timespan) return parsed; } } catch(e){} return { multiplier: 15, timespan: 'minute', text: '15m' }; })();";

      if (content.includes('this._period = null;')) {
        content = content.replace('this._period = null;', dynamicPeriodReplacement15m);
        modified = true;
        console.log(`Successfully patched: StoreImp constructor _period initialization in ${fileName}`);
      } else if (content.includes("this._period = { multiplier: 15, timespan: 'minute', text: '15m' };")) {
        content = content.replace("this._period = { multiplier: 15, timespan: 'minute', text: '15m' };", dynamicPeriodReplacement15m);
        modified = true;
        console.log(`Successfully updated StoreImp constructor _period initialization to dynamic in ${fileName}`);
      } else if (content.includes(dynamicPeriodSearch1H)) {
        content = content.replace(dynamicPeriodSearch1H, dynamicPeriodReplacement15m);
        modified = true;
        console.log(`Successfully updated StoreImp constructor _period initialization fallback to 15m in ${fileName}`);
      }

      // 4.7. Expand barSpaceLimit to allow unrestricted maximum zoom in and optimal zoom out (min: 0.8px)
      const barSpaceMinTargets = [
        'barSpaceLimit: { min: 0.1, max: 150 }',
        'barSpaceLimit: { min: 0.01, max: 1000 }',
        'barSpaceLimit: { min: 0.1, max: 120 }',
        'barSpaceLimit: { min: 0.5, max: 800 }',
        'barSpaceLimit: { min: 0.5, max: 150 }',
        'barSpaceLimit: { min: 1, max: 800 }',
        'barSpaceLimit: { min: 1, max: 150 }',
        'barSpaceLimit: { min: 2, max: 800 }',
        'barSpaceLimit: { min: 1.5, max: 800 }',
        'barSpaceLimit: { min: 0.1, max: 800 }'
      ];
      for (const bTarget of barSpaceMinTargets) {
        if (content.includes(bTarget)) {
          content = content.replaceAll(bTarget, 'barSpaceLimit: { min: 0.8, max: 800 }');
          modified = true;
          console.log(`Successfully updated barSpaceLimit (0.8 to 800) in ${fileName}`);
        }
      }

      // 4.8. Patch _calcOptimalBarSpace to ensure candles maintain shapes, centered wicks, and >=1px gaps when zoomed out
      const defaultCalcOptimalPattern = /StoreImp\.prototype\._calcOptimalBarSpace\s*=\s*function\s*\(\)\s*\{[\s\S]*?this\._gapBarSpace\s*=\s*Math\.max\(1,\s*gapBarSpace\);\s*\};/;
      const patchedCalcOptimal = `/* __optimal_bar_space_candle_shape_patched__ */ StoreImp.prototype._calcOptimalBarSpace = function () {
        var raw = Math.floor(this._barSpace * 0.8);
        var bodyWidth = (raw % 2 === 0) ? raw - 1 : raw;
        if (bodyWidth >= this._barSpace) {
            bodyWidth -= 2;
        }
        this._gapBarSpace = Math.max(1, bodyWidth);
    };`;
      if (defaultCalcOptimalPattern.test(content) && !content.includes('__optimal_bar_space_candle_shape_patched__')) {
        content = content.replace(defaultCalcOptimalPattern, patchedCalcOptimal);
        modified = true;
        console.log(`Successfully patched _calcOptimalBarSpace (maintain candle shape on zoom out) in ${fileName}`);
      } else if (content.includes('/* __optimal_bar_space_candle_shape_patched__ */')) {
        content = content.replace(/\/\*\s*__optimal_bar_space_candle_shape_patched__\s*\*\/[\s\S]*?this\._gapBarSpace\s*=\s*Math\.max\(1,\s*bodyWidth\);\s*\};/, patchedCalcOptimal);
        modified = true;
      }

      // 4.9. Patch XAxis scrolling targetBarSpace min clamp
      if (content.includes('var targetBarSpace = Math.max(0.5, Math.min(80, (this._xAxisStartBarSpace || 6) * scale));')) {
        content = content.replace('var targetBarSpace = Math.max(0.5, Math.min(80, (this._xAxisStartBarSpace || 6) * scale));', 'var targetBarSpace = Math.max(0.8, Math.min(800, (this._xAxisStartBarSpace || 6) * scale));');
        modified = true;
        console.log(`Successfully patched XAxis scrolling targetBarSpace clamp in ${fileName}`);
      } else if (content.includes('var targetBarSpace = Math.max(0.1, Math.min(80, (this._xAxisStartBarSpace || 6) * scale));')) {
        content = content.replace('var targetBarSpace = Math.max(0.1, Math.min(80, (this._xAxisStartBarSpace || 6) * scale));', 'var targetBarSpace = Math.max(0.8, Math.min(800, (this._xAxisStartBarSpace || 6) * scale));');
        modified = true;
        console.log(`Successfully patched XAxis scrolling targetBarSpace clamp in ${fileName}`);
      } else if (content.includes('var targetBarSpace = Math.max(2, Math.min(800, (this._xAxisStartBarSpace || 6) * scale));')) {
        content = content.replace('var targetBarSpace = Math.max(2, Math.min(800, (this._xAxisStartBarSpace || 6) * scale));', 'var targetBarSpace = Math.max(0.8, Math.min(800, (this._xAxisStartBarSpace || 6) * scale));');
        modified = true;
        console.log(`Successfully patched XAxis scrolling targetBarSpace clamp in ${fileName}`);
      } else if (content.includes('var targetBarSpace = Math.max(1.5, Math.min(800, (this._xAxisStartBarSpace || 6) * scale));')) {
        content = content.replace('var targetBarSpace = Math.max(1.5, Math.min(800, (this._xAxisStartBarSpace || 6) * scale));', 'var targetBarSpace = Math.max(0.8, Math.min(800, (this._xAxisStartBarSpace || 6) * scale));');
        modified = true;
        console.log(`Successfully patched XAxis scrolling targetBarSpace clamp in ${fileName}`);
      }

      // 4.10. Patch CandleBarView pixel centering (snap x to Math.round(x) so wicks are always centered and never offset to the right)
      const candleBarViewDrawPattern = 'var x = visibleData.x, _b = visibleData.data, current = _b.current, prev = _b.prev;';
      const candleBarViewDrawReplacement = 'var x = Math.round(visibleData.x), _b = visibleData.data, current = _b.current, prev = _b.prev;';
      if (content.includes(candleBarViewDrawPattern)) {
        content = content.replace(candleBarViewDrawPattern, candleBarViewDrawReplacement);
        modified = true;
        console.log(`Successfully patched CandleBarView pixel centering (x snapped to integer) in ${fileName}`);
      }

      // 4.11. Patch CandleBarView _createSolidBar and _createStrokeBar to enforce odd body widths and exact pixel alignment
      const solidBarPattern = /CandleBarView\.prototype\._createSolidBar\s*=\s*function\s*\(x,\s*priceY,\s*barSpace,\s*colors,\s*correction\)\s*\{[\s\S]*?CandleBarView\.prototype\._createStrokeBar\s*=\s*function\s*\(x,\s*priceY,\s*barSpace,\s*colors,\s*correction\)\s*\{[\s\S]*?return\s+CandleBarView;/;
      const solidBarReplacement = `CandleBarView.prototype._createSolidBar = function (x, priceY, barSpace, colors, correction) {
        var cx = Math.round(x);
        var rawBw = barSpace.gapBar + (correction || 0);
        var bw = Math.max(1, rawBw % 2 === 0 && rawBw > 1 ? rawBw - 1 : rawBw);
        var halfBw = Math.floor(bw / 2);
        return [
            {
                name: 'rect',
                attrs: {
                    x: cx,
                    y: priceY[0],
                    width: 1,
                    height: Math.max(1, priceY[3] - priceY[0])
                },
                styles: { color: colors[2] }
            },
            {
                name: 'rect',
                attrs: {
                    x: cx - halfBw,
                    y: priceY[1],
                    width: bw,
                    height: Math.max(1, priceY[2] - priceY[1])
                },
                styles: {
                    style: 'stroke_fill',
                    color: colors[0],
                    borderColor: colors[1]
                }
            }
        ];
    };
    CandleBarView.prototype._createStrokeBar = function (x, priceY, barSpace, colors, correction) {
        var cx = Math.round(x);
        var rawBw = barSpace.gapBar + (correction || 0);
        var bw = Math.max(1, rawBw % 2 === 0 && rawBw > 1 ? rawBw - 1 : rawBw);
        var halfBw = Math.floor(bw / 2);
        return [
            {
                name: 'rect',
                attrs: [
                    {
                        x: cx,
                        y: priceY[0],
                        width: 1,
                        height: Math.max(0, priceY[1] - priceY[0])
                    },
                    {
                        x: cx,
                        y: priceY[2],
                        width: 1,
                        height: Math.max(0, priceY[3] - priceY[2])
                    }
                ],
                styles: { color: colors[2] }
            },
            {
                name: 'rect',
                attrs: {
                    x: cx - halfBw,
                    y: priceY[1],
                    width: bw,
                    height: Math.max(1, priceY[2] - priceY[1])
                },
                styles: {
                    style: 'stroke',
                    borderColor: colors[1]
                }
            }
        ];
    };
    return CandleBarView;`;
      if (solidBarPattern.test(content)) {
        content = content.replace(solidBarPattern, solidBarReplacement);
        modified = true;
        console.log(`Successfully patched CandleBarView _createSolidBar & _createStrokeBar in ${fileName}`);
      }

      // 4.12. Patch CandleBarView.prototype.drawImp with batched direct canvas rendering for ultra-smooth 120FPS deep zoom
      const drawImpPattern = /CandleBarView\.prototype\.drawImp\s*=\s*function\s*\(ctx\)\s*\{[\s\S]*?CandleBarView\.prototype\.getCandleBarOptions/;
      const drawImpReplacement = `CandleBarView.prototype.drawImp = function (ctx) {
        var _this = this;
        var pane = this.getWidget().getPane();
        var isMain = pane.getId() === PaneIdConstants.CANDLE;
        var chartStore = pane.getChart().getChartStore();
        var candleBarOptions = this.getCandleBarOptions();
        if (candleBarOptions !== null) {
            var type_1 = candleBarOptions.type, styles_1 = candleBarOptions.styles;
            var ohlcSize_1 = 0;
            var halfOhlcSize_1 = 0;
            if (candleBarOptions.type === 'ohlc') {
                var gapBar = chartStore.getBarSpace().gapBar;
                ohlcSize_1 = Math.min(Math.max(Math.round(gapBar * 0.2), 1), 8);
                if (ohlcSize_1 > 2 && ohlcSize_1 % 2 === 1) {
                    ohlcSize_1--;
                }
                halfOhlcSize_1 = Math.floor(ohlcSize_1 / 2);
            }
            var yAxis_1 = pane.getYAxisComponentById(candleBarOptions.yAxisId);
            if (!yAxis_1 || typeof yAxis_1.convertToPixel !== 'function') {
                var yAxes = typeof pane.getAxisComponent === 'function' ? pane.getAxisComponent() : null;
                yAxis_1 = yAxes || pane._yAxis || null;
            }
            if (!yAxis_1 || typeof yAxis_1.convertToPixel !== 'function') {
                return;
            }

            // High-speed batched direct canvas renderer for solid candles
            if (type_1 === 'candle_solid') {
                var upWicks = [];
                var downWicks = [];
                var noChangeWicks = [];
                var upBodies = [];
                var downBodies = [];
                var noChangeBodies = [];

                this.eachChildren(function (visibleData, barSpace) {
                    var _a;
                    var current = visibleData.data.current;
                    if (isValid(current) && typeof current.open === 'number' && typeof current.close === 'number') {
                        var x = Math.round(visibleData.x);
                        var open_1 = current.open, high = current.high, low = current.low, close_1 = current.close;
                        var prev = visibleData.data.prev;
                        var comparePrice = styles_1.compareRule === 'current_open' ? open_1 : ((_a = prev === null || prev === void 0 ? void 0 : prev.close) !== null && _a !== void 0 ? _a : close_1);

                        var openY = yAxis_1.convertToPixel(open_1);
                        var closeY = yAxis_1.convertToPixel(close_1);
                        var highY = yAxis_1.convertToPixel(high !== undefined ? high : Math.max(open_1, close_1));
                        var lowY = yAxis_1.convertToPixel(low !== undefined ? low : Math.min(open_1, close_1));
                        if (!Number.isFinite(openY) || !Number.isFinite(closeY) || !Number.isFinite(highY) || !Number.isFinite(lowY)) return;

                        var topWickY = Math.min(highY, lowY);
                        var bottomWickY = Math.max(highY, lowY);
                        var topBodyY = Math.min(openY, closeY);
                        var bottomBodyY = Math.max(openY, closeY);
                        var bodyH = Math.max(1, bottomBodyY - topBodyY);
                        var wickH = Math.max(1, bottomWickY - topWickY);

                        var correction = barSpace.gapBar % 2 === 0 ? 1 : 0;
                        var rawBw = barSpace.gapBar + correction;
                        var bw = Math.max(1, rawBw % 2 === 0 && rawBw > 1 ? rawBw - 1 : rawBw);
                        var halfBw = Math.floor(bw / 2);
                        var bodyX = x - halfBw;

                        if (bw <= 1 || barSpace.gapBar <= 1) {
                            if (close_1 >= comparePrice) {
                                upWicks.push(x, topWickY, 1, wickH);
                            } else {
                                downWicks.push(x, topWickY, 1, wickH);
                            }
                        } else {
                            if (close_1 > comparePrice) {
                                upWicks.push(x, topWickY, 1, wickH);
                                upBodies.push(bodyX, topBodyY, bw, bodyH);
                            } else if (close_1 < comparePrice) {
                                downWicks.push(x, topWickY, 1, wickH);
                                downBodies.push(bodyX, topBodyY, bw, bodyH);
                            } else {
                                noChangeWicks.push(x, topWickY, 1, wickH);
                                noChangeBodies.push(bodyX, topBodyY, bw, bodyH);
                            }
                        }
                    }
                });

                // Batch draw wicks
                if (upWicks.length > 0) {
                    ctx.fillStyle = styles_1.upWickColor;
                    for (var i = 0; i < upWicks.length; i += 4) {
                        ctx.fillRect(upWicks[i], upWicks[i+1], upWicks[i+2], upWicks[i+3]);
                    }
                }
                if (downWicks.length > 0) {
                    ctx.fillStyle = styles_1.downWickColor;
                    for (var i = 0; i < downWicks.length; i += 4) {
                        ctx.fillRect(downWicks[i], downWicks[i+1], downWicks[i+2], downWicks[i+3]);
                    }
                }
                if (noChangeWicks.length > 0) {
                    ctx.fillStyle = styles_1.noChangeWickColor;
                    for (var i = 0; i < noChangeWicks.length; i += 4) {
                        ctx.fillRect(noChangeWicks[i], noChangeWicks[i+1], noChangeWicks[i+2], noChangeWicks[i+3]);
                    }
                }

                // Batch draw bodies
                if (upBodies.length > 0) {
                    ctx.fillStyle = styles_1.upColor;
                    for (var i = 0; i < upBodies.length; i += 4) {
                        ctx.fillRect(upBodies[i], upBodies[i+1], upBodies[i+2], upBodies[i+3]);
                    }
                }
                if (downBodies.length > 0) {
                    ctx.fillStyle = styles_1.downColor;
                    for (var i = 0; i < downBodies.length; i += 4) {
                        ctx.fillRect(downBodies[i], downBodies[i+1], downBodies[i+2], downBodies[i+3]);
                    }
                }
                if (noChangeBodies.length > 0) {
                    ctx.fillStyle = styles_1.noChangeColor;
                    for (var i = 0; i < noChangeBodies.length; i += 4) {
                        ctx.fillRect(noChangeBodies[i], noChangeBodies[i+1], noChangeBodies[i+2], noChangeBodies[i+3]);
                    }
                }
                return;
            }

            this.eachChildren(function (visibleData, barSpace) {
                var _a;
                var x = Math.round(visibleData.x), _b = visibleData.data, current = _b.current, prev = _b.prev;
                if (isValid(current) && typeof current.open === 'number' && typeof current.close === 'number') {
                    var open_1 = current.open, high = current.high, low = current.low, close_1 = current.close;
                    var comparePrice = styles_1.compareRule === 'current_open' ? open_1 : ((_a = prev === null || prev === void 0 ? void 0 : prev.close) !== null && _a !== void 0 ? _a : close_1);
                    var colors = [];
                    if (close_1 > comparePrice) {
                        colors[0] = styles_1.upColor;
                        colors[1] = styles_1.upBorderColor;
                        colors[2] = styles_1.upWickColor;
                    }
                    else if (close_1 < comparePrice) {
                        colors[0] = styles_1.downColor;
                        colors[1] = styles_1.downBorderColor;
                        colors[2] = styles_1.downWickColor;
                    }
                    else {
                        colors[0] = styles_1.noChangeColor;
                        colors[1] = styles_1.noChangeBorderColor;
                        colors[2] = styles_1.noChangeWickColor;
                    }
                    var openY = yAxis_1.convertToPixel(open_1);
                    var closeY = yAxis_1.convertToPixel(close_1);
                    var highY = yAxis_1.convertToPixel(high !== undefined ? high : Math.max(open_1, close_1));
                    var lowY = yAxis_1.convertToPixel(low !== undefined ? low : Math.min(open_1, close_1));
                    if (!Number.isFinite(openY) || !Number.isFinite(closeY) || !Number.isFinite(highY) || !Number.isFinite(lowY)) return;

                    var priceY = [openY, closeY, highY, lowY];
                    priceY.sort(function (a, b) { return a - b; });
                    var correction = barSpace.gapBar % 2 === 0 ? 1 : 0;
                    var rects = [];
                    switch (type_1) {
                        case 'candle_solid': {
                            rects = _this._createSolidBar(x, priceY, barSpace, colors, correction);
                            break;
                        }
                        case 'candle_stroke': {
                            rects = _this._createStrokeBar(x, priceY, barSpace, colors, correction);
                            break;
                        }
                        case 'candle_up_stroke': {
                            if (close_1 > open_1) {
                                rects = _this._createStrokeBar(x, priceY, barSpace, colors, correction);
                            }
                            else {
                                rects = _this._createSolidBar(x, priceY, barSpace, colors, correction);
                            }
                            break;
                        }
                        case 'candle_down_stroke': {
                            if (open_1 > close_1) {
                                rects = _this._createStrokeBar(x, priceY, barSpace, colors, correction);
                            }
                            else {
                                rects = _this._createSolidBar(x, priceY, barSpace, colors, correction);
                            }
                            break;
                        }
                        case 'ohlc': {
                            rects = [
                                {
                                    name: 'rect',
                                    attrs: [
                                        {
                                            x: x - halfOhlcSize_1,
                                            y: priceY[0],
                                            width: ohlcSize_1,
                                            height: priceY[3] - priceY[0]
                                        },
                                        {
                                            x: x - barSpace.halfGapBar,
                                            y: openY + ohlcSize_1 > priceY[3] ? priceY[3] - ohlcSize_1 : openY,
                                            width: barSpace.halfGapBar - halfOhlcSize_1,
                                            height: ohlcSize_1
                                        },
                                        {
                                            x: x + halfOhlcSize_1,
                                            y: closeY + ohlcSize_1 > priceY[3] ? priceY[3] - ohlcSize_1 : closeY,
                                            width: barSpace.halfGapBar - halfOhlcSize_1,
                                            height: ohlcSize_1
                                        }
                                    ],
                                    styles: { color: colors[0] }
                                }
                            ];
                            break;
                        }
                    }
                    rects.forEach(function (rect) {
                        var _a;
                        var handler = null;
                        if (isMain && typeof _this._boundCandleBarClickEvent === 'function') {
                            handler = {
                                mouseClickEvent: _this._boundCandleBarClickEvent(visibleData)
                            };
                        }
                        (_a = _this.createFigure(rect, handler !== null && handler !== void 0 ? handler : undefined)) === null || _a === void 0 ? void 0 : _a.draw(ctx);
                    });
                }
            });
        }
    };
    CandleBarView.prototype.getCandleBarOptions`;
      if (drawImpPattern.test(content)) {
        content = content.replace(drawImpPattern, drawImpReplacement);
        modified = true;
        console.log(`Successfully patched CandleBarView drawImp with ultra-fast batched rendering in ${fileName}`);
      }

      // 4.12b. Patch IndicatorView drawImp with ultra-fast batched rendering for Volume bars and lines
      const indicatorDrawPattern = /IndicatorView\.prototype\.drawImp\s*=\s*function\s*\(ctx\)\s*\{[\s\S]*?ctx\.restore\(\);\s*\}\s*;\s*return\s+IndicatorView;/;
      const indicatorDrawReplacement = `IndicatorView.prototype.drawImp = function (ctx) {
        var _this = this;
        _super.prototype.drawImp.call(this, ctx);
        var widget = this.getWidget();
        var pane = widget.getPane();
        var chart = pane.getChart();
        var bounding = widget.getBounding();
        var xAxis = chart.getXAxisPane().getXAxisComponent();
        var chartStore = chart.getChartStore();
        var indicators = chartStore.getIndicatorsByPaneId(pane.getId());
        var defaultStyles = chartStore.getStyles().indicator;
        ctx.save();
        indicators.forEach(function (indicator) {
            var yAxis = pane.getYAxisComponentById(indicator.yAxisId);
            if (!yAxis || typeof yAxis.convertToPixel !== 'function') {
                var yAxes = typeof pane.getAxisComponent === 'function' ? pane.getAxisComponent() : null;
                yAxis = yAxes || pane._yAxis || null;
            }
            if (!yAxis || typeof yAxis.convertToPixel !== 'function') return;
            if (indicator.visible) {
                if (indicator.zLevel < 0) {
                    ctx.globalCompositeOperation = 'destination-over';
                }
                else {
                    ctx.globalCompositeOperation = 'source-over';
                }
                var isCover = false;
                if (indicator.draw !== null) {
                    ctx.save();
                    isCover = indicator.draw({
                        ctx: ctx,
                        chart: chart,
                        indicator: indicator,
                        bounding: bounding,
                        xAxis: xAxis,
                        yAxis: yAxis
                    });
                    ctx.restore();
                }
                if (!isCover) {
                    var result_1 = indicator.result;
                    var lines_1 = [];
                    var barsByColor = {};
                    _this.eachChildren(function (data, barSpace) {
                        var _a, _b, _c;
                        var halfGapBar = barSpace.halfGapBar;
                        var dataIndex = data.dataIndex, x = data.x;
                        var prevX = xAxis.convertToPixel(dataIndex - 1);
                        var nextX = xAxis.convertToPixel(dataIndex + 1);
                        var prevData = (_a = result_1[dataIndex - 1]) !== null && _a !== void 0 ? _a : null;
                        var currentData = (_b = result_1[dataIndex]) !== null && _b !== void 0 ? _b : null;
                        var nextData = (_c = result_1[dataIndex + 1]) !== null && _c !== void 0 ? _c : null;
                        var prevCoordinate = { x: prevX };
                        var currentCoordinate = { x: x };
                        var nextCoordinate = { x: nextX };
                        indicator.figures.forEach(function (_a) {
                            var key = _a.key;
                            var prevValue = prevData === null || prevData === void 0 ? void 0 : prevData[key];
                            if (isNumber(prevValue)) {
                                prevCoordinate[key] = yAxis.convertToPixel(prevValue);
                            }
                            var currentValue = currentData === null || currentData === void 0 ? void 0 : currentData[key];
                            if (isNumber(currentValue)) {
                                currentCoordinate[key] = yAxis.convertToPixel(currentValue);
                            }
                            var nextValue = nextData === null || nextData === void 0 ? void 0 : nextData[key];
                            if (isNumber(nextValue)) {
                                nextCoordinate[key] = yAxis.convertToPixel(nextValue);
                            }
                        });
                        eachFigures(indicator, dataIndex, barSpace, defaultStyles, function (figure, figureStyles, figureIndex) {
                            var _a, _b, _c, _d, _e;
                            if (isValid(currentData === null || currentData === void 0 ? void 0 : currentData[figure.key])) {
                                var valueY = currentCoordinate[figure.key];
                                var attrs = (_a = figure.attrs) === null || _a === void 0 ? void 0 : _a.call(figure, {
                                    data: { prev: prevData, current: currentData, next: nextData },
                                    coordinate: { prev: prevCoordinate, current: currentCoordinate, next: nextCoordinate },
                                    bounding: bounding,
                                    barSpace: barSpace,
                                    xAxis: xAxis,
                                    yAxis: yAxis
                                });
                                switch (figure.type) {
                                    case 'text': {
                                        attrs = __assign({ x: x, y: valueY, text: currentData === null || currentData === void 0 ? void 0 : currentData[figure.key], align: 'center', baseline: 'middle' }, attrs);
                                        break;
                                    }
                                    case 'circle': {
                                        attrs = __assign({ x: x, y: valueY, r: Math.max(1, halfGapBar) }, attrs);
                                        break;
                                    }
                                    case 'rect':
                                    case 'bar': {
                                        var baseValue = (_b = figure.baseValue) !== null && _b !== void 0 ? _b : yAxis.getRange().from;
                                        var baseValueY = yAxis.convertToPixel(baseValue);
                                        var height = Math.abs(baseValueY - valueY);
                                        if (baseValue !== (currentData === null || currentData === void 0 ? void 0 : currentData[figure.key])) {
                                            height = Math.max(1, height);
                                        }
                                        var y = 0;
                                        if (valueY > baseValueY) {
                                            y = baseValueY;
                                        }
                                        else {
                                            y = valueY;
                                        }
                                        var barWidth = (_c = attrs === null || attrs === void 0 ? void 0 : attrs.width) !== null && _c !== void 0 ? _c : halfGapBar * 2;
                                        var bx = Math.round(x - barWidth / 2);
                                        var bw = Math.max(1, Math.round(barWidth));
                                        var color = (figureStyles && figureStyles.color) || '#26a69a';
                                        if (!barsByColor[color]) barsByColor[color] = [];
                                        barsByColor[color].push(bx, y, bw, height);
                                        return;
                                    }
                                    case 'line': {
                                        if (!isValid(lines_1[figureIndex])) {
                                            lines_1[figureIndex] = [];
                                        }
                                        if (isNumber(currentCoordinate[figure.key]) && isNumber(nextCoordinate[figure.key])) {
                                            lines_1[figureIndex].push({
                                                coordinates: (_d = attrs === null || attrs === void 0 ? void 0 : attrs.coordinates) !== null && _d !== void 0 ? _d : [
                                                    { x: currentCoordinate.x, y: currentCoordinate[figure.key] },
                                                    { x: nextCoordinate.x, y: nextCoordinate[figure.key] }
                                                ],
                                                styles: figureStyles
                                            });
                                        }
                                        break;
                                    }
                                }
                                var type = figure.type;
                                if (isValid(attrs) && type !== 'line') {
                                    (_e = _this.createFigure({
                                        name: type === 'bar' ? 'rect' : type,
                                        attrs: attrs,
                                        styles: figureStyles
                                    })) === null || _e === void 0 ? void 0 : _e.draw(ctx);
                                }
                            }
                        });
                    });
                    // Fast batch draw bars (Volume bars, etc.)
                    for (var color in barsByColor) {
                        var rects = barsByColor[color];
                        ctx.fillStyle = color;
                        ctx.beginPath();
                        for (var ri = 0; ri < rects.length; ri += 4) {
                            ctx.rect(rects[ri], rects[ri + 1], rects[ri + 2], rects[ri + 3]);
                        }
                        ctx.fill();
                    }
                    // Fast batch draw merged lines
                    lines_1.forEach(function (items) {
                        if (items.length > 0) {
                            var lineStyles = items[0].styles || {};
                            ctx.strokeStyle = lineStyles.color || '#2196F3';
                            ctx.lineWidth = lineStyles.size || 1;
                            var lineStyle = lineStyles.style || 'solid';
                            if (lineStyle === 'dashed') ctx.setLineDash([4, 4]);
                            else if (lineStyle === 'dotted') ctx.setLineDash([1, 2]);
                            else ctx.setLineDash([]);
                            ctx.beginPath();
                            ctx.moveTo(items[0].coordinates[0].x, items[0].coordinates[0].y);
                            for (var li = 0; li < items.length; li++) {
                                var coords = items[li].coordinates;
                                ctx.lineTo(coords[1].x, coords[1].y);
                            }
                            ctx.stroke();
                        }
                    });
                }
            }
        });
        ctx.restore();
    };
    return IndicatorView;`;
      if (indicatorDrawPattern.test(content)) {
        content = content.replace(indicatorDrawPattern, indicatorDrawReplacement);
        modified = true;
        console.log(`Successfully patched IndicatorView drawImp with ultra-fast batched rendering in ${fileName}`);
      }

      // 4.12b. Patch StoreImp.prototype.setPeriod, getters, and _addData in a single unified block
      const storeMethodsPattern = /StoreImp\.prototype\.setPeriod\s*=\s*function\s*\(period\)\s*\{[\s\S]*?(?=\s*StoreImp\.prototype\.setDataLoader|\s*\/\*\s*__optimal_bar_space)/;
      const storeMethodsReplacement = `StoreImp.prototype.setPeriod = function (period) {
        var _this = this;
        var prevCenterTs = null;
        if (this._dataList && this._dataList.length > 0) {
            var vr = this._visibleRange;
            var totalCount = this._dataList.length;
            var cIdx = -1;
            if (this._lastBarRightSideDiffBarCount < 0) {
                if (vr && typeof vr.realFrom === 'number' && typeof vr.realTo === 'number' && vr.realTo > vr.realFrom) {
                    cIdx = Math.max(0, Math.min(totalCount - 1, Math.round((vr.realFrom + vr.realTo) / 2)));
                } else {
                    var visBars = (this._totalBarSpace || 800) / (this._barSpace || 6);
                    cIdx = Math.max(0, Math.min(totalCount - 1, Math.round(totalCount + this._lastBarRightSideDiffBarCount - (visBars / 2))));
                }
                if (cIdx >= 0 && cIdx < totalCount - 15 && this._dataList[cIdx] && typeof this._dataList[cIdx].timestamp === 'number') {
                    prevCenterTs = this._dataList[cIdx].timestamp;
                }
            }
        }
        var anchorInfo = prevCenterTs ? { timestamp: prevCenterTs, screenRatio: 0.5 } : null;
        if (typeof window !== 'undefined' && window.__ACTIVE_DATAFEED__) {
            window.__ACTIVE_DATAFEED__.savedAnchorInfo = anchorInfo;
            window.__ACTIVE_DATAFEED__.savedAnchorTimestamp = prevCenterTs;
        }
        this._processDataUnsubscribe();
        this._loading = false;
        this._period = period;
        this.__preserve_anchor_ts__ = anchorInfo;
        this._processDataLoad('init');
      };
    StoreImp.prototype.getPeriod = function () {
        return this._period;
    };
    StoreImp.prototype.getTotalBarSpace = function () {
        return this._totalBarSpace;
    };
    StoreImp.prototype.getBarSpace = function () {
        return {
            bar: this._barSpace,
            halfBar: this._barSpace / 2,
            gapBar: this._gapBar,
            halfGapBar: this._gapBar / 2
        };
    };
    StoreImp.prototype.getOffsetRightDistance = function () {
        return this._offsetRightDistance;
    };
    StoreImp.prototype.getLastBarRightSideDiffBarCount = function () {
        return this._lastBarRightSideDiffBarCount;
    };
    StoreImp.prototype.getDataList = function () {
        return this._dataList;
    };
    StoreImp.prototype._addData = function (data, type, more) {
        var _a, _b;
        var success = false;
        var adjustFlag = false;
        if (isArray(data)) {
            var realMore = { backward: false, forward: true };
            if (isBoolean(more)) {
                realMore.backward = more;
                realMore.forward = more;
            }
            else if (isValid(more)) {
                realMore.backward = (_a = more === null || more === void 0 ? void 0 : more.backward) !== null && _a !== void 0 ? _a : false;
                realMore.forward = (_b = more === null || more === void 0 ? void 0 : more.forward) !== null && _b !== void 0 ? _b : true;
            }
            switch (type) {
                case 'init': {
                    this._clearData();
                    this._dataList = data;
                    this._dataLoadMore.backward = realMore.backward;
                    this._dataLoadMore.forward = true;
                    var anchorTs = this.__preserve_anchor_ts__ || (this._chart && this._chart.__preserve_anchor_ts__);
                    if (!anchorTs && typeof window !== 'undefined' && window.__ACTIVE_DATAFEED__ && window.__ACTIVE_DATAFEED__.savedAnchorInfo) {
                        anchorTs = window.__ACTIVE_DATAFEED__.savedAnchorInfo;
                    }
                    if (anchorTs && typeof anchorTs === 'object' && typeof anchorTs.timestamp === 'number' && data.length > 0) {
                        var targetTs = anchorTs.timestamp;
                        var screenRatio = typeof anchorTs.screenRatio === 'number' ? anchorTs.screenRatio : 0.5;
                        this.__preserve_anchor_ts__ = null;
                        if (this._chart) this._chart.__preserve_anchor_ts__ = null;
                        if (typeof window !== 'undefined' && window.__ACTIVE_DATAFEED__) {
                            window.__ACTIVE_DATAFEED__.savedAnchorInfo = null;
                        }
                        var targetIdx = -1;
                        var minDiff = Infinity;
                        for (var ti = 0; ti < data.length; ti++) {
                            var diff = Math.abs(data[ti].timestamp - targetTs);
                            if (diff < minDiff) {
                                minDiff = diff;
                                targetIdx = ti;
                            }
                        }
                        if (targetIdx >= 0 && targetIdx < data.length - 15) {
                            var totalSpace = this._totalBarSpace > 0 ? this._totalBarSpace : 800;
                            var bSpace = this._barSpace > 0 ? this._barSpace : 6;
                            var visibleBarCount = totalSpace / bSpace;
                            var newLastBarDiff = (targetIdx - data.length) + (visibleBarCount * (1 - screenRatio)) + 0.5;
                            this._lastBarRightSideDiffBarCount = Math.round(newLastBarDiff);
                        } else {
                            var _cs = (typeof window !== 'undefined' ? (window.__chart_styles__ || {}) : {});
                            var defaultRightBars = _cs.marginRight !== undefined ? Number(_cs.marginRight) : 10;
                            this._lastBarRightSideDiffBarCount = defaultRightBars;
                            this._offsetRightDistance = defaultRightBars * this._barSpace;
                        }
                    } else {
                        var _cs = (typeof window !== 'undefined' ? (window.__chart_styles__ || {}) : {});
                        var defaultRightBars = _cs.marginRight !== undefined ? Number(_cs.marginRight) : 10;
                        this._lastBarRightSideDiffBarCount = defaultRightBars;
                        this._offsetRightDistance = defaultRightBars * this._barSpace;
                    }
                    adjustFlag = true;
                    break;
                }
                case 'backward': {
                    this._dataList = this._dataList.concat(data);
                    this._dataLoadMore.backward = realMore.backward;
                    this._lastBarRightSideDiffBarCount -= data.length;
                    this._startLastBarRightSideDiffBarCount -= data.length;
                    adjustFlag = data.length > 0;
                    break;
                }
                case 'forward': {
                    if (data && data.length > 0) {
                        var oldestTs = this._dataList.length > 0 ? this._dataList[0].timestamp : Infinity;
                        var validOlder = data.filter(function(d) { return d && typeof d.timestamp === 'number' && d.timestamp < oldestTs; });
                        if (validOlder.length > 0) {
                            this._dataList = validOlder.concat(this._dataList);
                            adjustFlag = true;
                        }
                        // Use the callback's more flag instead of permanently disabling
                        this._dataLoadMore.forward = validOlder.length > 0 ? (realMore.forward !== false) : (realMore.forward === true);
                    } else {
                        this._dataLoadMore.forward = realMore.forward === true;
                    }
                    break;
                }
            }
            success = true;
        }
        else {
            var dataCount = this._dataList.length;
            var timestamp = data.timestamp;
            var curSym = this._symbol;
            var curTick = (curSym && (curSym.ticker || curSym.name)) ? (curSym.ticker || curSym.name).toUpperCase().replace(/[-/]/g, '') : '';
            if (data && typeof data.close === 'number') {
                this.__latest_live_price__ = data.close;
                this.__latest_live_ticker__ = curTick;
                if (this._chart) {
                    this._chart.__latest_live_price__ = data.close;
                    this._chart.__latest_live_ticker__ = curTick;
                }
            }
            var lastDataTimestamp = formatValue(this._dataList[dataCount - 1], 'timestamp', 0);
            var mult = (this._period && (this._period.multiplier || this._period.span)) || 1;
            var tspan = (this._period && (this._period.timespan || this._period.type)) || 'minute';
            var periodMs = 60000;
            if (tspan === 'second') periodMs = mult * 1000;
            else if (tspan === 'minute') periodMs = mult * 60000;
            else if (tspan === 'hour') periodMs = mult * 3600000;
            else if (tspan === 'day') periodMs = mult * 86400000;
            else if (tspan === 'week') periodMs = mult * 7 * 86400000;
            else if (tspan === 'month') periodMs = mult * 30 * 86400000;
            else if (tspan === 'year') periodMs = mult * 365 * 86400000;

            if (timestamp === lastDataTimestamp) {
                this._dataList[dataCount - 1] = data;
                success = true;
                adjustFlag = true;
            }
            else if (timestamp > lastDataTimestamp) {
                // Prevent appending live updates to historical data segments with huge gaps
                if (timestamp - lastDataTimestamp <= Math.max(periodMs * 4, 3600000)) {
                    this._dataList.push(data);
                    var lastBarRightSideDiffBarCount = this.getLastBarRightSideDiffBarCount();
                    if (lastBarRightSideDiffBarCount < 0) {
                        this.setLastBarRightSideDiffBarCount(--lastBarRightSideDiffBarCount);
                    }
                    success = true;
                    adjustFlag = true;
                } else {
                    // Disjoint historical view: do not push into historical slice, but record live data & trigger redraw of price scale & mark!
                    var curSym = this._symbol;
                    var curTick = (curSym && (curSym.ticker || curSym.name)) ? (curSym.ticker || curSym.name).toUpperCase().replace(/[-/]/g, '') : '';
                    this.__latest_live_price__ = data.close;
                    this.__latest_live_data__ = data;
                    this.__latest_live_ticker__ = curTick;
                    if (this._chart) {
                        this._chart.__latest_live_price__ = data.close;
                        this._chart.__latest_live_data__ = data;
                        this._chart.__latest_live_ticker__ = curTick;
                    }
                    success = true;
                    adjustFlag = true;
                }
            }
        }
        if (success && adjustFlag) {
            this._adjustVisibleRange();
            this.setCrosshair(this._crosshair, { notInvalidate: true });
            var filterIndicators = typeof this.getIndicatorsByFilter === 'function' ? this.getIndicatorsByFilter({}) : [];
            if (filterIndicators.length > 0 && typeof this._calcIndicator === 'function') {
                this._calcIndicator(filterIndicators);
            }
            if (this._chart && typeof this._chart.layout === 'function') {
                this._chart.layout({
                    measureWidth: true,
                    update: true,
                    buildYAxisTick: true,
                    cacheYAxisWidth: type !== 'init'
                });
            }
        }
      };`;
      if (storeMethodsPattern.test(content)) {
        content = content.replace(storeMethodsPattern, storeMethodsReplacement);
        modified = true;
        console.log(`Successfully patched StoreImp.setPeriod, getters, and _addData in ${fileName}`);
      }

      // 4.12c2. Patch StoreImp.prototype._adjustVisibleRange to track anchor timestamp and reliably trigger historical loading
      const adjustVisibleRangePattern = /StoreImp\.prototype\._adjustVisibleRange\s*=\s*function\s*\(\)\s*\{[\s\S]*?if\s*\(from\s*<=\s*50\)\s*\{[\s\S]*?this\._processDataLoad\('backward'\);\s*\}\s*\}\s*\};/;
      const adjustVisibleRangeReplacement = `StoreImp.prototype._adjustVisibleRange = function () {
        var _a, _b;
        var totalBarCount = this._dataList.length;
        var visibleBarCount = this._totalBarSpace / this._barSpace;
        var leftMinVisibleBarCount = 0;
        var rightMinVisibleBarCount = 0;
        if (this._scrollLimitRole === 'distance') {
            leftMinVisibleBarCount = (this._totalBarSpace - this._maxOffsetDistance.right) / this._barSpace;
            rightMinVisibleBarCount = (this._totalBarSpace - this._maxOffsetDistance.left) / this._barSpace;
        }
        else {
            leftMinVisibleBarCount = this._minVisibleBarCount.left;
            rightMinVisibleBarCount = this._minVisibleBarCount.right;
        }
        leftMinVisibleBarCount = Math.max(0, leftMinVisibleBarCount);
        rightMinVisibleBarCount = Math.max(0, rightMinVisibleBarCount);
        var maxRightOffsetBarCount = visibleBarCount - Math.min(leftMinVisibleBarCount, totalBarCount);
        if (this._lastBarRightSideDiffBarCount > maxRightOffsetBarCount) {
            this._lastBarRightSideDiffBarCount = maxRightOffsetBarCount;
        }
        var minRightOffsetBarCount = -totalBarCount + Math.min(rightMinVisibleBarCount, totalBarCount);
        if (this._lastBarRightSideDiffBarCount < minRightOffsetBarCount) {
            this._lastBarRightSideDiffBarCount = minRightOffsetBarCount;
        }
        var to = Math.round(this._lastBarRightSideDiffBarCount + totalBarCount + 0.5);
        var realTo = to;
        if (to > totalBarCount) {
            to = totalBarCount;
        }
        var from = Math.round(to - visibleBarCount) - 1;
        if (from < 0) {
            from = 0;
        }
        var realFrom = this._lastBarRightSideDiffBarCount > 0 ? Math.round(totalBarCount + this._lastBarRightSideDiffBarCount - visibleBarCount) - 1 : from;
        this._visibleRange = { from: from, to: to, realFrom: realFrom, realTo: realTo };
        
        // Only track anchor timestamp when actively panned into historical candles
        if (totalBarCount > 0 && this._lastBarRightSideDiffBarCount < 0 && realTo < totalBarCount - 15) {
            var cIdx = Math.max(0, Math.min(totalBarCount - 1, Math.round((realFrom + realTo) / 2)));
            if (this._dataList[cIdx] && typeof this._dataList[cIdx].timestamp === 'number') {
                var ts = this._dataList[cIdx].timestamp;
                this.__saved_anchor_timestamp__ = ts;
                if (this._chart) this._chart.__saved_anchor_timestamp__ = ts;
                if (typeof window !== 'undefined' && window.__ACTIVE_DATAFEED__) {
                    window.__ACTIVE_DATAFEED__.savedAnchorInfo = { timestamp: ts, screenRatio: 0.5 };
                    window.__ACTIVE_DATAFEED__.savedAnchorTimestamp = ts;
                }
            }
        } else {
            this.__saved_anchor_timestamp__ = null;
            if (this._chart) this._chart.__saved_anchor_timestamp__ = null;
            if (typeof window !== 'undefined' && window.__ACTIVE_DATAFEED__) {
                window.__ACTIVE_DATAFEED__.savedAnchorInfo = null;
                window.__ACTIVE_DATAFEED__.savedAnchorTimestamp = null;
            }
        }
        
        this.executeAction('onVisibleRangeChange', this._visibleRange);
        this._visibleRangeDataList = [];
        this._visibleRangeHighLowPrice = [
            { x: 0, price: Number.MIN_SAFE_INTEGER },
            { x: 0, price: Number.MAX_SAFE_INTEGER }
        ];
        var loopFrom = Math.max(0, realFrom);
        var loopTo = Math.min(totalBarCount, realTo);
        for (var i = loopFrom; i < loopTo; i++) {
            var kLineData = this._dataList[i];
            if (!kLineData) continue;
            var x = this.dataIndexToCoordinate(i);
            this._visibleRangeDataList.push({
                dataIndex: i,
                x: x,
                data: {
                    prev: (_a = this._dataList[i - 1]) !== null && _a !== void 0 ? _a : kLineData,
                    current: kLineData,
                    next: (_b = this._dataList[i + 1]) !== null && _b !== void 0 ? _b : kLineData
                }
            });
            if (isValid(kLineData)) {
                if (this._visibleRangeHighLowPrice[0].price < kLineData.high) {
                    this._visibleRangeHighLowPrice[0].price = kLineData.high;
                    this._visibleRangeHighLowPrice[0].x = x;
                }
                if (this._visibleRangeHighLowPrice[1].price > kLineData.low) {
                    this._visibleRangeHighLowPrice[1].price = kLineData.low;
                    this._visibleRangeHighLowPrice[1].x = x;
                }
            }
        }
        if (from <= 50) {
            if (this._dataLoadMore.forward && !this._loading) {
                this._processDataLoad('forward');
            }
        }
        else if (to >= totalBarCount - 30) {
            if (this._dataLoadMore.backward && !this._loading) {
                this._processDataLoad('backward');
            }
        }
      };`;
      if (adjustVisibleRangePattern.test(content)) {
        content = content.replace(adjustVisibleRangePattern, adjustVisibleRangeReplacement);
        modified = true;
        console.log(`Successfully patched StoreImp._adjustVisibleRange for anchor tracking in ${fileName}`);
      }

      // 4.12d. Patch StoreImp.prototype._processDataLoad to ensure historical loading works on first load
      const processDataLoadPattern = /StoreImp\.prototype\._processDataLoad\s*=\s*function\s*\(type\)\s*\{[\s\S]*?void activeDataLoader\.getBars\(params\);[\s\S]*?(?:\s*\}\s*\}\;|\s*\})|StoreImp\.prototype\._processDataLoad\s*=\s*function\s*\(type\)\s*\{[\s\S]*?void this\._dataLoader\.getBars\(params\);(?:\s*\}\s*\}\;|\s*\})/;
      const processDataLoadReplacement = `StoreImp.prototype._processDataLoad = function (type) {
        var _this = this;
        var _a, _b, _c, _d;
        var activeDataLoader = this._dataLoader;
        if (!activeDataLoader && typeof window !== 'undefined' && window.__ACTIVE_DATAFEED__) {
            var df = window.__ACTIVE_DATAFEED__;
            activeDataLoader = {
                getBars: function(params) {
                    if (params.type === 'forward') {
                        var oldestTs = Number(params.timestamp);
                        if (Number.isFinite(oldestTs)) {
                            df.getHistoryKLineData(_this._symbol, _this._period, 0, oldestTs - 1)
                                .then(function(bars) {
                                    var olderBars = (bars || []).filter(function(b) { return Number(b.timestamp) < oldestTs; });
                                    params.callback(olderBars, { forward: olderBars.length > 0, backward: true });
                                })
                                .catch(function() {
                                    params.callback([], { forward: false, backward: false });
                                });
                            return;
                        }
                    } else if (params.type === 'backward') {
                        var newestTs = Number(params.timestamp);
                        if (Number.isFinite(newestTs)) {
                            if (typeof df.loadNewerHistory === 'function') {
                                df.loadNewerHistory(_this._symbol, _this._period, newestTs)
                                    .then(function(bars) {
                                        var newerBars = (bars || []).filter(function(b) { return Number(b.timestamp) > newestTs; });
                                        params.callback(newerBars, { forward: true, backward: newerBars.length > 0 });
                                    })
                                    .catch(function() {
                                        params.callback([], { forward: false, backward: false });
                                    });
                                return;
                            }
                        }
                    }
                    params.callback([], { forward: false, backward: false });
                }
            };
            this._dataLoader = activeDataLoader;
        }

        if (!this._loading && isValid(activeDataLoader)) {
            this._loading = true;
            var params = {
                type: type,
                symbol: this._symbol,
                period: this._period,
                timestamp: null,
                callback: function (data, more) {
                    var _a, _b;
                    _this._loading = false;
                    var addFn = _this._addData || (typeof StoreImp !== 'undefined' && StoreImp.prototype && StoreImp.prototype._addData);
                    if (typeof addFn === 'function') {
                        addFn.call(_this, data, type, more);
                    }
                    if (type === 'init') {
                        (_b = (_a = activeDataLoader) === null || _a === void 0 ? void 0 : _a.subscribeBar) === null || _b === void 0 ? void 0 : _b.call(_a, {
                            symbol: _this._symbol,
                            period: _this._period,
                            callback: function (data) {
                                var fn = _this._addData || (typeof StoreImp !== 'undefined' && StoreImp.prototype && StoreImp.prototype._addData);
                                if (typeof fn === 'function') {
                                    fn.call(_this, data, 'update');
                                }
                            }
                        });
                    }
                }
            };
            switch (type) {
                case 'backward': {
                    params.timestamp = (_b = (_a = this._dataList[this._dataList.length - 1]) === null || _a === void 0 ? void 0 : _a.timestamp) !== null && _b !== void 0 ? _b : null;
                    break;
                }
                case 'forward': {
                    params.timestamp = (_d = (_c = this._dataList[0]) === null || _c === void 0 ? void 0 : _c.timestamp) !== null && _d !== void 0 ? _d : null;
                    break;
                }
            }
            void activeDataLoader.getBars(params);
        }
    };`;
      if (processDataLoadPattern.test(content)) {
        content = content.replace(processDataLoadPattern, processDataLoadReplacement);
        modified = true;
        console.log(`Successfully patched StoreImp._processDataLoad in ${fileName}`);
      }

      // 4.13. Patch Event.prototype._processMainScrollingEvent for instant 0ms latency drag tracking with rolling velocity buffer and strict position drag isolation
      if (content.includes('Event.prototype._processMainScrollingEvent = function (widget, event) {')) {
        if (!content.includes('/* __position_drag_isolated_top__ */')) {
          content = content.replace(
            'Event.prototype._processMainScrollingEvent = function (widget, event) {',
            `Event.prototype._processMainScrollingEvent = function (widget, event) {\n        /* __position_drag_isolated_top__ */\n        if (typeof window !== 'undefined' && window.__is_position_dragging__) return;`
          );
          modified = true;
          console.log(`Successfully patched _processMainScrollingEvent entry guard in ${fileName}`);
        }
      }
      if (content.includes('._processMainScrollingEvent=function(t,e){')) {
        if (!content.includes('/* __min_position_drag_isolated__ */')) {
          content = content.replace(
            '._processMainScrollingEvent=function(t,e){',
            `._processMainScrollingEvent=function(t,e){/* __min_position_drag_isolated__ */if(typeof window!=="undefined"&&window.__is_position_dragging__)return;`
          );
          modified = true;
          console.log(`Successfully patched minified _processMainScrollingEvent in ${fileName}`);
        }
      }
      const mainScrollPattern = /var distance = event\.x - this\._startScrollCoordinate\.x;[\s\S]*?this\._chart\.getChartStore\(\)\.scroll\([^\)]+\);(?:\s*\}\s*\}\;|\s*)/;
      const mainScrollReplacement = `var now = performance.now();
            if (typeof window !== 'undefined' && window.__is_position_dragging__) return;
            if (!this._dragHistory) this._dragHistory = [];
            this._dragHistory.push({ x: event.x, time: now });
            while (this._dragHistory.length > 1 && (now - this._dragHistory[0].time > 120)) {
                this._dragHistory.shift();
            }
            var distance = event.x - this._startScrollCoordinate.x;
            this._chart.getChartStore().scroll(distance);
        }`;
      if (content.includes('this._dragHistory')) {
        content = content.replace(/var now = performance\.now\(\);[\s\S]*?this\._chart\.getChartStore\(\)\.scroll\(distance\);\s*\}/, mainScrollReplacement);
        modified = true;
      } else if (content.includes('var distance = event.x - this._startScrollCoordinate.x;')) {
        content = content.replace('var distance = event.x - this._startScrollCoordinate.x;\n            this._chart.getChartStore().scroll(distance);', mainScrollReplacement);
        modified = true;
        console.log(`Successfully updated _processMainScrollingEvent with velocity history buffer in ${fileName}`);
      }

      // 4.14. Patch StoreImp.prototype.scroll for synchronous ultra-smooth 120fps dragging with auto-fit Y-axis (buildYAxisTick: true)
      const storeScrollPattern = /StoreImp\.prototype\.scroll\s*=\s*function\s*\(distance\)\s*\{[\s\S]*?(?=\s*StoreImp\.prototype\.getDataByDataIndex)/;
      const storeScrollReplacement = `StoreImp.prototype.scroll = function (distance) {
        if (!this._scrollEnabled || (typeof window !== 'undefined' && window.__is_position_dragging__)) {
            return;
        }
        var distanceBarCount = distance / this._barSpace;
        var prevLastBarRightSideDistance = this._lastBarRightSideDiffBarCount * this._barSpace;
        this._lastBarRightSideDiffBarCount = this._startLastBarRightSideDiffBarCount - distanceBarCount;
        this._adjustVisibleRange();
        this.setCrosshair(this._crosshair, { notInvalidate: true });
        this._chart.layout({
            measureWidth: false,
            update: true,
            buildYAxisTick: true,
            cacheYAxisWidth: true
        });
        var realDistance = Math.round(prevLastBarRightSideDistance - this._lastBarRightSideDiffBarCount * this._barSpace);
        if (realDistance !== 0) {
            this.executeAction('onScroll', { distance: realDistance });
        }
    };`;
      if (storeScrollPattern.test(content)) {
        content = content.replace(storeScrollPattern, storeScrollReplacement);
        modified = true;
        console.log(`Successfully patched StoreImp.prototype.scroll for synchronous 120fps dragging in \${fileName}`);
      }

      // Also reset fling scroll on startScroll
      const startScrollPattern = /StoreImp\.prototype\.startScroll\s*=\s*function\s*\(\)\s*\{[\s\S]*?this\._startLastBarRightSideDiffBarCount\s*=\s*this\._lastBarRightSideDiffBarCount;\s*\};/;
      const startScrollReplacement = `StoreImp.prototype.startScroll = function () {
        if (typeof window !== 'undefined' && window.__is_position_dragging__) {
            return;
        }
        if (this._scrollRafId) {
            cancelAnimationFrame(this._scrollRafId);
            this._scrollRafId = null;
        }
        this._startLastBarRightSideDiffBarCount = this._lastBarRightSideDiffBarCount;
    };`;
      if (startScrollPattern.test(content)) {
        content = content.replace(startScrollPattern, startScrollReplacement);
        modified = true;
        console.log(`Successfully patched StoreImp.prototype.startScroll in ${fileName}`);
      }

      // 4.15. Patch Event.prototype mouseDownEvent and mouseUpEvent for TradingView-style kinetic inertia momentum fling
      const duplicateFlingPattern = /(?:if\s*\(this\._flingScrollAnimation\s*!==\s*null\)\s*\{\s*this\._flingScrollAnimation\.cancel\(\);\s*this\._flingScrollAnimation\s*=\s*null;\s*\}\s*this\._dragHistory\s*=\s*\[\{\s*x:\s*event_2\.x,\s*time:\s*performance\.now\(\)\s*\}\];\s*)+/g;
      if (duplicateFlingPattern.test(content)) {
        content = content.replace(duplicateFlingPattern, `/* __mousedown_fling_patched__ */
                        if (this._flingScrollAnimation !== null) {
                            this._flingScrollAnimation.cancel();
                            this._flingScrollAnimation = null;
                        }
                        this._dragHistory = [{ x: event_2.x, time: performance.now() }];
                        `);
        modified = true;
      }
      if (!content.includes('__mousedown_fling_patched__')) {
        const mouseDownFlingPattern = 'this._startScrollCoordinate = { x: event_2.x, y: event_2.y };\n                        this._chart.getChartStore().startScroll();';
        const mouseDownFlingReplacement = `/* __mousedown_fling_patched__ */
                        if (this._flingScrollAnimation !== null) {
                            this._flingScrollAnimation.cancel();
                            this._flingScrollAnimation = null;
                        }
                        this._dragHistory = [{ x: event_2.x, time: performance.now() }];
                        this._startScrollCoordinate = { x: event_2.x, y: event_2.y };
                        this._chart.getChartStore().startScroll();`;
        if (content.includes(mouseDownFlingPattern)) {
          content = content.replace(mouseDownFlingPattern, mouseDownFlingReplacement);
          modified = true;
          console.log(`Successfully patched mouseDownEvent with fling tracking in ${fileName}`);
        }
      }

      // 4.16. Patch pressedMouseMoveEvent crosshair notInvalidate to prevent blocking drag thread
      const dragCrosshairPattern = 'this._chart.getChartStore().setCrosshair(crosshair, { forceInvalidate: true });\n                    return consumed;';
      const dragCrosshairReplacement = 'this._chart.getChartStore().setCrosshair(crosshair, { notInvalidate: true });\n                    return consumed;';
      if (content.includes(dragCrosshairPattern)) {
        content = content.replace(dragCrosshairPattern, dragCrosshairReplacement);
        modified = true;
        console.log(`Successfully patched pressedMouseMoveEvent to notInvalidate crosshair during drag in ${fileName}`);
      }

      // 4.17. Patch mouseUpEvent with TradingView kinetic momentum glide
      const mouseUpFlingPattern = /Event\.prototype\.mouseUpEvent\s*=\s*function\s*\(e\)\s*\{[\s\S]*?this\._yAxisStartScaleDistance\s*=\s*0;\s*return\s+consumed;\s*\};/;
      const mouseUpFlingReplacement = `Event.prototype.mouseUpEvent = function (e) {
        var _this = this;
        var widget = this._findWidgetByEvent(e).widget;
        var consumed = false;
        if (widget !== null) {
            var event_4 = this._makeWidgetEvent(e, widget);
            var name_5 = widget.getName();
            switch (name_5) {
                case WidgetNameConstants.MAIN: {
                    consumed = widget.dispatchEvent('mouseUpEvent', event_4);
                    if (this._startScrollCoordinate !== null && this._dragHistory && this._dragHistory.length >= 2) {
                        var first = this._dragHistory[0];
                        var last = this._dragHistory[this._dragHistory.length - 1];
                        var dt = last.time - first.time;
                        var dx = last.x - first.x;
                        if (dt > 15 && dt < 160) {
                            var velocity = (dx / dt) * 16.6;
                            var initialFrameDistance_1 = velocity * 1.5;
                            if (Math.abs(initialFrameDistance_1) > 1.0) {
                                var store_1 = this._chart.getChartStore();
                                var duration_1 = (Math.log(1 / Math.abs(initialFrameDistance_1)) / Math.log(0.96)) * 16.6;
                                if (duration_1 > 50) {
                                    var animation_1 = new Animation({ duration: duration_1 }).doFrame(function (frameTime) {
                                        var frameCount = frameTime / 16.6;
                                        var progressDistance = (initialFrameDistance_1 * (1 - Math.pow(0.96, frameCount))) / (1 - 0.96);
                                        store_1.scroll(progressDistance);
                                        if (frameTime >= duration_1 && _this._flingScrollAnimation === animation_1) {
                                            _this._flingScrollAnimation = null;
                                        }
                                    });
                                    store_1.startScroll();
                                    this._flingScrollAnimation = animation_1;
                                    animation_1.start();
                                }
                            }
                        }
                    }
                    this._dragHistory = [];
                    break;
                }
                case WidgetNameConstants.SEPARATOR:
                case WidgetNameConstants.X_AXIS:
                case WidgetNameConstants.Y_AXIS: {
                    consumed = widget.dispatchEvent('mouseUpEvent', event_4);
                    break;
                }
            }
            if (consumed) {
                this._chart.updatePane(1 /* UpdateLevel.Overlay */);
            }
        }
        this._mouseDownWidget = null;
        this._startScrollCoordinate = null;
        this._prevYAxisRanges.clear();
        this._xAxisStartScaleCoordinate = null;
        this._xAxisStartScaleDistance = 0;
        this._xAxisScale = 1;
        this._yAxisStartScaleDistance = 0;
        return consumed;
    };`;
      if (mouseUpFlingPattern.test(content)) {
        content = content.replace(mouseUpFlingPattern, mouseUpFlingReplacement);
        modified = true;
        console.log(`Successfully patched mouseUpEvent with TradingView kinetic momentum glide in ${fileName}`);
      }

      // 4.18. Patch StoreImp.prototype.zoom for fast, responsive, smooth zoom transitions with maximum zoom range
      const zoomPattern = /StoreImp\.prototype\.zoom\s*=\s*function\s*\(scale,\s*coordinate,\s*position\)\s*\{[\s\S]*?this\.executeAction\('onZoom',\s*\{\s*scale:\s*realScale\s*\}\);\s*\}\s*\};/;
      const zoomReplacement = `StoreImp.prototype.zoom = function (scale, coordinate, position) {
        var _this = this;
        var _a;
        if (!this._zoomEnabled) {
            return;
        }
        var zoomCoordinate = coordinate !== null && coordinate !== void 0 ? coordinate : { x: (_a = this._crosshair.x) !== null && _a !== void 0 ? _a : this._totalBarSpace / 2 };
        if (position === 'xAxis') {
            if (this._zoomAnchor.xAxis === 'last_bar') {
                zoomCoordinate.x = this.dataIndexToCoordinate(this._dataList.length - 1);
            }
        }
        else {
            if (this._zoomAnchor.main === 'last_bar') {
                zoomCoordinate.x = this.dataIndexToCoordinate(this._dataList.length - 1);
            }
        }
        var x = zoomCoordinate.x;
        var floatIndex = this.coordinateToFloatIndex(x);
        var prevBarSpace = this._barSpace;
        var zoomMultiplier = scale > 0 ? (1 + scale * 0.20) : (1 / (1 + Math.abs(scale) * 0.20));
        var newBarSpace = Math.max(0.05, Math.min(300, this._barSpace * zoomMultiplier));
        this.setBarSpace(newBarSpace, function () {
            _this._lastBarRightSideDiffBarCount += floatIndex - _this.coordinateToFloatIndex(x);
        });
        var realScale = this._barSpace / prevBarSpace;
        if (realScale !== 1) {
            this.executeAction('onZoom', { scale: realScale });
        }
    };`;
      if (zoomPattern.test(content)) {
        content = content.replace(zoomPattern, zoomReplacement);
        modified = true;
        console.log(`Successfully patched StoreImp.prototype.zoom for maximum zoom range in ${fileName}`);
      }

      // Also ensure setBarSpace allows barSpace between 0.05 and 300
      const setBarSpacePattern = /StoreImp\.prototype\.setBarSpace\s*=\s*function\s*\(barSpace,\s*adjustBeforeFunc\)\s*\{[\s\S]*?(?=\s*StoreImp\.prototype\.getLayoutOptions)/;
      const setBarSpaceReplacement = `StoreImp.prototype.setBarSpace = function (barSpace, adjustBeforeFunc) {
        var minLimit = (this._layoutOptions && this._layoutOptions.barSpaceLimit && this._layoutOptions.barSpaceLimit.min) || 0.05;
        var maxLimit = (this._layoutOptions && this._layoutOptions.barSpaceLimit && this._layoutOptions.barSpaceLimit.max) || 300;
        if (barSpace < minLimit || barSpace > maxLimit || this._barSpace === barSpace) {
            return;
        }
        this._barSpace = barSpace;
        this._calcOptimalBarSpace();
        adjustBeforeFunc === null || adjustBeforeFunc === void 0 ? void 0 : adjustBeforeFunc();
        this._adjustVisibleRange();
        this.setCrosshair(this._crosshair, { notInvalidate: true });
        this._chart.layout({
            measureWidth: false,
            update: true,
            buildYAxisTick: true,
            cacheYAxisWidth: true
        });
    };`;
      if (setBarSpacePattern.test(content)) {
        content = content.replace(setBarSpacePattern, setBarSpaceReplacement);
        modified = true;
        console.log(`Successfully patched StoreImp.prototype.setBarSpace in ${fileName}`);
      }

      // 4.19. Patch ChartImp.prototype.layout to eliminate Promise.resolve() microtask delay for 0ms lag drag & zoom
      const esmLayoutPromisePattern = /if\s*\(\!this\._layoutPending\)\s*\{\s*this\._layoutPending\s*=\s*true;\s*Promise\.resolve\(\)\s*\.then\(function\s*\(_\)\s*\{\s*_this\._layout\(\);\s*_this\._layoutPending\s*=\s*false;\s*\}\)\s*\.catch\(function\s*\(_\)\s*\{\s*\/\/ todo\s*\}\);\s*\}/;
      const esmLayoutSyncReplacement = `if (!this._layoutPending) {
            this._layoutPending = true;
            this._layout();
            this._layoutPending = false;
        }`;
      if (esmLayoutPromisePattern.test(content)) {
        content = content.replace(esmLayoutPromisePattern, esmLayoutSyncReplacement);
        modified = true;
        console.log(`Successfully patched ChartImp.prototype.layout (synchronous zero-delay layout) in ${fileName}`);
      }

      // 4.20. Patch YAxisImp.prototype.createRangeImp to dynamically respect configured marginTop & marginBottom
      const duplicatedCsPattern = /(var _cs = \(typeof window !== 'undefined' \? \(window\.__chart_styles__ \|\| \{\}\) : \{\}\);\s*if \(_cs\.marginTop !== undefined\) \{\s*top = Number\(_cs\.marginTop\) \/ 100;\s*\}\s*if \(_cs\.marginBottom !== undefined\) \{\s*bottom = Number\(_cs\.marginBottom\) \/ 100;\s*\}\s*){2,}/g;
      if (duplicatedCsPattern.test(content)) {
        content = content.replace(duplicatedCsPattern, `var _cs = (typeof window !== 'undefined' ? (window.__chart_styles__ || {}) : {});
        if (_cs.marginTop !== undefined) {
            top = Number(_cs.marginTop) / 100;
        }
        if (_cs.marginBottom !== undefined) {
            bottom = Number(_cs.marginBottom) / 100;
        }`);
        modified = true;
      }
      if (!content.includes('__yaxis_margin_gap_patched__')) {
        const esmCreateRangeGapPattern = /var height = this\.getBounding\(\)\.height;\s*var _c = this\.gap,\s*top = _c\.top,\s*bottom = _c\.bottom;/;
        const esmCreateRangeGapReplacement = `/* __yaxis_margin_gap_patched__ */ var height = this.getBounding().height;
        var _c = this.gap, top = _c.top, bottom = _c.bottom;
        var _cs = (typeof window !== 'undefined' ? (window.__chart_styles__ || {}) : {});
        if (_cs.marginTop !== undefined) {
            top = Number(_cs.marginTop) / 100;
        }
        if (_cs.marginBottom !== undefined) {
            bottom = Number(_cs.marginBottom) / 100;
        }`;
        if (esmCreateRangeGapPattern.test(content)) {
          content = content.replace(esmCreateRangeGapPattern, esmCreateRangeGapReplacement);
          modified = true;
          console.log(`Successfully patched YAxisImp.prototype.createRangeImp margins in ${fileName}`);
        }
      }

      // 4.21. Patch CandleLastPriceLabelView.prototype.drawImp and CandleLastPriceView.prototype.drawImp to always prioritize current chart data and prevent cross-symbol contamination
      const lastPriceLabelPattern = /CandleLastPriceLabelView\.prototype\.drawImp\s*=\s*function\s*\(ctx\)\s*\{[\s\S]*?return\s+CandleLastPriceLabelView;\s*\}\(\w+\)\);/;
      const lastPriceLabelReplacement = `CandleLastPriceLabelView.prototype.drawImp = function (ctx) {
        var _a, _b, _c, _d;
        var widget = this.getWidget();
        var pane = widget.getPane();
        var bounding = widget.getBounding();
        var chartStore = pane.getChart().getChartStore();
        var priceMarkStyles = chartStore.getStyles().candle.priceMark;
        var lastPriceMarkStyles = priceMarkStyles.last;
        var lastPriceMarkTextStyles = lastPriceMarkStyles.text;
        if (priceMarkStyles.show && lastPriceMarkStyles.show && lastPriceMarkTextStyles.show) {
            var precision = (_b = (_a = chartStore.getSymbol()) === null || _a === void 0 ? void 0 : _a.pricePrecision) !== null && _b !== void 0 ? _b : SymbolDefaultPrecisionConstants.PRICE;
            var yAxis = widget.getAxisComponent();
            var dataList = chartStore.getDataList();
            var currentSymbol = chartStore.getSymbol();
            var currentTicker = (currentSymbol && (currentSymbol.ticker || currentSymbol.name)) ? (currentSymbol.ticker || currentSymbol.name).toUpperCase().replace(/[-/]/g, '') : '';
            var lastCandle = (dataList && dataList.length > 0) ? dataList[dataList.length - 1] : null;
            var data_1 = lastCandle;
            if (!data_1 && chartStore.__latest_live_data__ && chartStore.__latest_live_ticker__ === currentTicker) {
                data_1 = chartStore.__latest_live_data__;
            }
            var close_1 = (data_1 && typeof data_1.close === 'number' && isFinite(data_1.close)) ? data_1.close : null;
            if (typeof close_1 === 'number' && isFinite(close_1)) {
                var open_1 = data_1 ? data_1.open : close_1;
                var prevCandle = (dataList && dataList.length >= 2) ? dataList[dataList.length - 2] : null;
                var comparePrice = lastPriceMarkStyles.compareRule === 'current_open' ? open_1 : ((prevCandle && typeof prevCandle.close === 'number') ? prevCandle.close : open_1);
                var priceY = yAxis.convertToNicePixel(close_1);
                var backgroundColor_1 = '';
                if (close_1 > comparePrice) {
                    backgroundColor_1 = lastPriceMarkStyles.upColor || '#089981';
                }
                else if (close_1 < comparePrice) {
                    backgroundColor_1 = lastPriceMarkStyles.downColor || '#f23645';
                }
                else {
                    backgroundColor_1 = lastPriceMarkStyles.noChangeColor || '#868993';
                }
                var yAxisRange = yAxis.getRange();
                var priceText = yAxis.displayValueToText(yAxis.realValueToDisplayValue(yAxis.valueToRealValue(close_1, { range: yAxisRange }), { range: yAxisRange }), precision);
                priceText = chartStore.getDecimalFold().format(chartStore.getThousandsSeparator().format(priceText));
                var fontSize = lastPriceMarkTextStyles.size || 11;
                var fontFamily = lastPriceMarkTextStyles.family || 'Rubik, sans-serif';
                var fontWeight = lastPriceMarkTextStyles.weight || '600';

                ctx.save();
                ctx.font = fontWeight + ' ' + fontSize + 'px ' + fontFamily;
                var pillWidth = bounding.width;
                var pillHeight = Math.round(fontSize + 8);
                var pillY = Math.round(priceY - pillHeight / 2);

                ctx.beginPath();
                ctx.rect(0, pillY, pillWidth, pillHeight);
                ctx.closePath();
                ctx.fillStyle = backgroundColor_1;
                ctx.fill();

                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillStyle = '#ffffff';
                ctx.fillText(priceText, pillWidth / 2, pillY + pillHeight / 2);

                var formatExtendText_1 = chartStore.getInnerFormatter().formatExtendText;
                var aboveY_1 = pillY;
                var belowY_1 = pillY + pillHeight;
                if (lastPriceMarkStyles.extendTexts && Array.isArray(lastPriceMarkStyles.extendTexts)) {
                    lastPriceMarkStyles.extendTexts.forEach(function (item, index) {
                        var text = formatExtendText_1({ type: 'last_price', data: data_1 || { close: close_1, open: open_1 }, index: index });
                        if (text && text.length > 0 && item.show) {
                            var extSize = item.size || 10;
                            ctx.font = (item.weight || 'normal') + ' ' + extSize + 'px ' + (item.family || fontFamily);
                            var extH = Math.round(extSize + 4);
                            var extY = 0;
                            if (item.position === 'above_price') {
                                aboveY_1 -= extH + 2;
                                extY = aboveY_1;
                            } else {
                                extY = belowY_1 + 2;
                                belowY_1 += extH + 2;
                            }
                            ctx.beginPath();
                            ctx.rect(0, extY, pillWidth, extH);
                            ctx.closePath();
                            ctx.fillStyle = backgroundColor_1;
                            ctx.fill();
                            ctx.fillStyle = '#ffffff';
                            ctx.textAlign = 'center';
                            ctx.textBaseline = 'middle';
                            ctx.fillText(text, pillWidth / 2, extY + extH / 2);
                        }
                    });
                }
                ctx.restore();
            }
        }
    };
    return CandleLastPriceLabelView;
}(View));`;

      if (lastPriceLabelPattern.test(content)) {
        content = content.replace(lastPriceLabelPattern, lastPriceLabelReplacement);
        modified = true;
        console.log(`Successfully patched CandleLastPriceLabelView.prototype.drawImp in ${fileName}`);
      }

      const lastPriceLinePattern = /CandleLastPriceView\.prototype\.drawImp\s*=\s*function\s*\(ctx\)\s*\{[\s\S]*?return\s+CandleLastPriceView;\s*\}\(\w+\)\);/;
      const lastPriceLineReplacement = `CandleLastPriceView.prototype.drawImp = function (ctx) {
        var _a, _b, _c;
        var widget = this.getWidget();
        var pane = widget.getPane();
        var bounding = widget.getBounding();
        var chartStore = pane.getChart().getChartStore();
        var priceMarkStyles = chartStore.getStyles().candle.priceMark;
        var lastPriceMarkStyles = priceMarkStyles.last;
        var lastPriceMarkLineStyles = lastPriceMarkStyles.line;
        if (priceMarkStyles.show && lastPriceMarkStyles.show && lastPriceMarkLineStyles.show) {
            var yAxis = pane.getYAxisComponentById();
            var dataList = chartStore.getDataList();
            var currentSymbol = chartStore.getSymbol();
            var currentTicker = (currentSymbol && (currentSymbol.ticker || currentSymbol.name)) ? (currentSymbol.ticker || currentSymbol.name).toUpperCase().replace(/[-/]/g, '') : '';
            var lastCandle = (dataList && dataList.length > 0) ? dataList[dataList.length - 1] : null;
            var data = lastCandle;
            if (!data && chartStore.__latest_live_data__ && chartStore.__latest_live_ticker__ === currentTicker) {
                data = chartStore.__latest_live_data__;
            }
            var close_1 = (data && typeof data.close === 'number' && isFinite(data.close)) ? data.close : null;
            if (typeof close_1 === 'number' && isFinite(close_1)) {
                var open_1 = data ? data.open : close_1;
                var prevCandle = (dataList && dataList.length >= 2) ? dataList[dataList.length - 2] : null;
                var comparePrice = lastPriceMarkStyles.compareRule === 'current_open' ? open_1 : ((prevCandle && typeof prevCandle.close === 'number') ? prevCandle.close : open_1);
                var priceY = yAxis.convertToNicePixel(close_1);
                var color = '';
                if (close_1 > comparePrice) {
                    color = lastPriceMarkStyles.upColor;
                }
                else if (close_1 < comparePrice) {
                    color = lastPriceMarkStyles.downColor;
                }
                else {
                    color = lastPriceMarkStyles.noChangeColor;
                }
                (_c = this.createFigure({
                    name: 'line',
                    attrs: {
                        coordinates: [
                            { x: 0, y: priceY },
                            { x: bounding.width, y: priceY }
                        ]
                    },
                    styles: {
                        style: lastPriceMarkLineStyles.style,
                        color: color,
                        size: lastPriceMarkLineStyles.size,
                        dashedValue: lastPriceMarkLineStyles.dashedValue
                    }
                })) === null || _c === void 0 ? void 0 : _c.draw(ctx);
            }
        }
    };
    return CandleLastPriceView;
}(View));`;

      if (lastPriceLinePattern.test(content)) {
        content = content.replace(lastPriceLinePattern, lastPriceLineReplacement);
        modified = true;
        console.log(`Successfully patched CandleLastPriceView.prototype.drawImp in ${fileName}`);
      }

      // 5. Add UMD/ESM missing exports
      if (fileName === 'index.esm.js') {
        const targetExport = /export\s*\{\s*dispose,\s*getFigureClass/;
        if (targetExport.test(content) && !content.includes('FormatDateType')) {
          const dummyDefs = `
          var FormatDateType = { XAxis: 'xAxis', Tooltip: 'tooltip', Crosshair: 'crosshair' };
          var DomPosition = { Root: 'root', Main: 'main', YAxis: 'yAxis', XAxis: 'xAxis' };
          var ActionType = { OnCommonDraw: 'onCommonDraw', OnDrawStart: 'onDrawStart', OnDrawing: 'onDrawing', OnDrawEnd: 'onDrawEnd', OnIndicatorChange: 'onIndicatorChange' };
          var TooltipIconPosition = { Left: 'left', Middle: 'middle', Right: 'right' };
          `;
          content = dummyDefs + content;
          content = content.replace(targetExport, 'export { FormatDateType, DomPosition, ActionType, TooltipIconPosition, dispose, getFigureClass');
          modified = true;
          console.log(`Successfully patched missing ESM exports in ${fileName}`);
        }
      } else if (fileName === kcName + '.js') {
        if (!content.includes('exports.FormatDateType')) {
          const dummyDefs = `
          var FormatDateType = { XAxis: 'xAxis', Tooltip: 'tooltip', Crosshair: 'crosshair' };
          var DomPosition = { Root: 'root', Main: 'main', YAxis: 'yAxis', XAxis: 'xAxis' };
          var ActionType = { OnCommonDraw: 'onCommonDraw', OnDrawStart: 'onDrawStart', OnDrawing: 'onDrawing', OnDrawEnd: 'onDrawEnd', OnIndicatorChange: 'onIndicatorChange' };
          var TooltipIconPosition = { Left: 'left', Middle: 'middle', Right: 'right' };
          exports.FormatDateType = FormatDateType;
          exports.DomPosition = DomPosition;
          exports.ActionType = ActionType;
          exports.TooltipIconPosition = TooltipIconPosition;
          `;
          content = content.replace('exports.version = version;', 'exports.version = version;\n' + dummyDefs);
          modified = true;
          console.log(`Successfully patched missing UMD exports in ${fileName}`);
        }
      }
    }

    // 6. Free-moving crosshair: use raw mouse X (follows cursor freely without candle-wick snapping)
    if (content.includes('__crosshair_candle_snap_on_drawing_patched__')) {
      const candleSnapRegex = /\/\*\s*__crosshair_candle_snap_on_drawing_patched__\s*\*\/[\s\S]*?if\s*\(_isDrawMode\s*&&\s*isNumber\(cr\.x\)\)\s*\{\s*cr\s*=\s*Object\.assign\(\{\},\s*cr,\s*\{\s*x:\s*realX\s*\}\);\s*\}/;
      const smoothReplacement = `/* __crosshair_free_move_patched__ */
        var realX = isNumber(cr.x) ? cr.x : this.dataIndexToCoordinate(realDataIndex);`;
      content = content.replace(candleSnapRegex, smoothReplacement);
      modified = true;
      console.log(`Successfully updated drawing crosshair to smooth TradingView style in ${fileName}`);
    } else if (!content.includes('__crosshair_free_move_patched__')) {
      const normalWickPattern = '/* __crosshair_normal_wick_patched__ */ var realX = this.dataIndexToCoordinate(realDataIndex);';
      const defaultPattern = 'var realX = this.dataIndexToCoordinate(realDataIndex);';
      const freeMoveReplacement = '/* __crosshair_free_move_patched__ */ var realX = isNumber(cr.x) ? cr.x : this.dataIndexToCoordinate(realDataIndex);';
      if (content.includes(normalWickPattern)) {
        content = content.replace(normalWickPattern, freeMoveReplacement);
        modified = true;
        console.log(`Successfully reverted to free-moving crosshair in ${fileName}`);
      } else if (content.includes(defaultPattern)) {
        content = content.replace(defaultPattern, freeMoveReplacement);
        modified = true;
        console.log(`Successfully patched free-moving crosshair in ${fileName}`);
      }
    }

    // 6b. Float-precision dataIndexToCoordinate and coordinateToFloatIndex exact 1:1 alignment
    if (!content.includes('__coordinate_float_index_exact_patched__')) {
      const esmCoordPattern = `StoreImp.prototype.coordinateToFloatIndex = function (x) {
        var dataCount = this._dataList.length;
        var deltaFromRight = (this._totalBarSpace - x) / this._barSpace;
        var index = dataCount + this._lastBarRightSideDiffBarCount - deltaFromRight;
        return Math.round(index * 1000000) / 1000000;
    };`;
      const esmCoordReplacement = `/* __coordinate_float_index_exact_patched__ */ StoreImp.prototype.coordinateToFloatIndex = function (x) {
        var dataCount = this._dataList.length;
        var deltaFromRight = (this._totalBarSpace - x) / this._barSpace;
        var index = dataCount + this._lastBarRightSideDiffBarCount - deltaFromRight - 0.5;
        return Math.round(index * 1000000) / 1000000;
    };
    StoreImp.prototype.coordinateToDataIndex = function (x) {
        return Math.round(this.coordinateToFloatIndex(x));
    };`;
      if (content.includes(esmCoordPattern)) {
        content = content.replace(esmCoordPattern, esmCoordReplacement);
        modified = true;
        console.log(`Successfully patched coordinateToFloatIndex exact subpixel alignment in ${fileName}`);
      }
    }

    if (!content.includes('__dataindex_float_precision_patched__')) {
      const esmPattern = 'StoreImp.prototype.dataIndexToCoordinate = function (dataIndex) {\n        var dataCount = this._dataList.length;\n        var deltaFromRight = dataCount + this._lastBarRightSideDiffBarCount - dataIndex;\n        return Math.floor(this._totalBarSpace - (deltaFromRight - 0.5) * this._barSpace + 0.5);\n    };';
      const esmReplacement = `/* __dataindex_float_precision_patched__ */ StoreImp.prototype.dataIndexToCoordinate = function (dataIndex) {
        var dataCount = this._dataList.length;
        var deltaFromRight = dataCount + this._lastBarRightSideDiffBarCount - dataIndex;
        return this._totalBarSpace - (deltaFromRight - 0.5) * this._barSpace;
    };`;
      if (content.includes(esmPattern)) {
        content = content.replace(esmPattern, esmReplacement);
        modified = true;
        console.log(`Successfully patched dataIndexToCoordinate float precision (ESM) in ${fileName}`);
      }
      // Minified fallback: match the Math.floor pattern in dataIndexToCoordinate
      const minPattern = /\.dataIndexToCoordinate\s*=\s*function\s*\((\w+)\)\s*\{\s*var\s+(\w+)\s*=\s*this\._dataList\.length;\s*var\s+(\w+)\s*=\s*\2\s*\+\s*this\._lastBarRightSideDiffBarCount\s*-\s*\1;\s*return\s+Math\.floor\(this\._totalBarSpace\s*-\s*\(\3\s*-\s*0\.5\)\s*\*\s*this\._barSpace\s*\+\s*0\.5\);\s*\}/;
      const minMatch = content.match(minPattern);
      if (minMatch && !content.includes('__dataindex_float_precision_patched__')) {
        content = content.replace(minMatch[0],
          `.dataIndexToCoordinate = function (${minMatch[1]}) { /* __dataindex_float_precision_patched__ */ var ${minMatch[2]} = this._dataList.length; var ${minMatch[3]} = ${minMatch[2]} + this._lastBarRightSideDiffBarCount - ${minMatch[1]}; return this._totalBarSpace - (${minMatch[3]} - 0.5) * this._barSpace; }`
        );
        modified = true;
        console.log(`Successfully patched dataIndexToCoordinate float precision (minified) in ${fileName}`);
      }
    }

    // 6b2. Restore and optimize Event.prototype.mouseMoveEvent and Event.prototype.mouseDownEvent
    if (content.includes('Event.prototype.mouseWheelVertEvent') && content.includes('Event.prototype.pressedMouseMoveEvent')) {
      const idx1 = content.indexOf('Event.prototype.mouseWheelVertEvent');
      const idx2 = content.indexOf('Event.prototype.pressedMouseMoveEvent');
      const sub = content.slice(idx1, idx2);
      const replacement = `Event.prototype.mouseWheelVertEvent = function (e, scale) {
        if (scale === void 0) { scale = 0; }
        var widget = this._findWidgetByEvent(e).widget;
        var event = this._makeWidgetEvent(e, widget);
        var name = widget === null || widget === void 0 ? void 0 : widget.getName();
        if (name === WidgetNameConstants.MAIN) {
            this._chart.getChartStore().zoom(scale, { x: event.x, y: event.y }, 'main');
            return true;
        }
        if (name === WidgetNameConstants.Y_AXIS) {
            var yAxisWidget = widget;
            var yAxis = this._getYAxisByWidget(yAxisWidget);
            if (yAxis.scrollZoomEnabled) {
                var scaleFactor = 1 + scale * 0.05;
                var targetYAxis = this._getYAxisScaleTargetByWidget(yAxisWidget);
                this._zoomYAxis(targetYAxis, scaleFactor);
                this._syncManualYAxesValueRange(yAxisWidget, targetYAxis);
                return true;
            }
        }
        return false;
    };
    Event.prototype.mouseMoveEvent = function (e) {
        /* __crosshair_mouse_move_patched__ */
        var _a = this._findWidgetByEvent(e), pane = _a.pane, widget = _a.widget;
        if (widget !== null) {
            var event = this._makeWidgetEvent(e, widget);
            var name = widget.getName();
            switch (name) {
                case WidgetNameConstants.MAIN: {
                    var crosshair = { x: event.x, y: event.y, paneId: pane === null || pane === void 0 ? void 0 : pane.getId() };
                    // Set crosshair BEFORE overlay dispatch so _coordinateToPoint can read snapped position
                    this._chart.getChartStore().setCrosshair(crosshair, { notInvalidate: true });
                    var consumed = widget.dispatchEvent('mouseMoveEvent', event);
                    if (consumed) {
                        widget.setCursor('pointer');
                    } else {
                        widget.setCursor('crosshair');
                    }
                    this._chart.getChartStore().setCrosshair(crosshair, { forceInvalidate: true });
                    return consumed;
                }
                case WidgetNameConstants.SEPARATOR:
                case WidgetNameConstants.X_AXIS:
                case WidgetNameConstants.Y_AXIS: {
                    var consumed = widget.dispatchEvent('mouseMoveEvent', event);
                    this._chart.getChartStore().setCrosshair(undefined, { forceInvalidate: true });
                    return consumed;
                }
            }
        }
        return false;
    };
    Event.prototype.mouseDownEvent = function (e) {
        if (typeof window !== 'undefined' && window.__is_position_dragging__) {
            return false;
        }
        var _a = this._findWidgetByEvent(e), pane = _a.pane, widget = _a.widget;
        this._mouseDownWidget = widget;
        if (widget !== null) {
            var event = this._makeWidgetEvent(e, widget);
            var name = widget.getName();
            switch (name) {
                case WidgetNameConstants.SEPARATOR: {
                    return widget.dispatchEvent('mouseDownEvent', event);
                }
                case WidgetNameConstants.MAIN: {
                    var chartStore = this._chart.getChartStore();
                    if (pane) {
                        chartStore.setCrosshair({ x: event.x, y: event.y, paneId: pane.getId() }, { forceInvalidate: true });
                    }
                    var consumed = widget.dispatchEvent('mouseDownEvent', event);
                    if (consumed) {
                        this._touchCancelCrosshair = true;
                        this._touchCoordinate = null;
                        chartStore.setCrosshair(undefined, { notInvalidate: true });
                        this._chart.updatePane(1 /* UpdateLevel.Overlay */);
                        return true;
                    }
                    if (this._flingScrollAnimation !== null && this._flingScrollAnimation !== undefined) {
                        this._flingScrollAnimation.cancel();
                        this._flingScrollAnimation = null;
                    }
                    this._flingStartTime = performance.now();
                    if (pane && typeof pane.getYAxisComponents === 'function') {
                        var yAxes = pane.getYAxisComponents();
                        if (yAxes) {
                            for (var yIdx = 0; yIdx < yAxes.length; yIdx++) {
                                var yAxis = yAxes[yIdx];
                                if (yAxis && !yAxis.getAutoCalcTickFlag()) {
                                    var range = yAxis.getRange();
                                    this._prevYAxisRanges.set(yAxis, Object.assign({}, range));
                                }
                            }
                        }
                    }
                    this._startScrollCoordinate = { x: event.x, y: event.y };
                    chartStore.startScroll();
                    return false;
                }
                case WidgetNameConstants.X_AXIS: {
                    var consumed = widget.dispatchEvent('mouseDownEvent', event);
                    if (!consumed) {
                        this._processXAxisScrollStartEvent(event);
                    }
                    return consumed;
                }
                case WidgetNameConstants.Y_AXIS: {
                    var consumed = widget.dispatchEvent('mouseDownEvent', event);
                    if (!consumed) {
                        this._processYAxisScaleStartEvent(widget, event);
                    }
                    return consumed;
                }
            }
        }
        return false;
    };
    `;
      if (sub.trim() !== replacement.trim()) {
        content = content.replace(sub, replacement);
        modified = true;
        console.log(`Successfully restored and patched mouseMoveEvent in ${fileName}`);
      }
    }

    // 6c. Crosshair Line Drawing (clean and robust)
    {
      const esmDrawLineReplacement = `/* __crosshair_exact_cursor_align_patched__ */ CrosshairLineView.prototype._drawLine = function (ctx, coordinates, styles) {
        var _a;
        if (styles && styles.show !== false) {
            var lineStyles = styles.line || styles;
            if (lineStyles && lineStyles.show !== false) {
                (_a = this.createFigure({
                    name: 'line',
                    attrs: { coordinates: coordinates },
                    styles: lineStyles
                })) === null || _a === void 0 ? void 0 : _a.draw(ctx);
            }
        }
    };`;
      const oldDrawLinePat = /\/\*\s*__crosshair_exact_cursor_align_patched__\s*\*\/[\s\S]*?CrosshairLineView\.prototype\._drawLine\s*=\s*function\s*\(ctx,\s*coordinates,\s*styles\)\s*\{[\s\S]*?\n\s*\};/;
      if (oldDrawLinePat.test(content)) {
        content = content.replace(oldDrawLinePat, esmDrawLineReplacement.trim());
        modified = true;
        console.log(`Successfully updated CrosshairLineView draw in ${fileName}`);
      } else {
        const esmDrawLinePattern = 'CrosshairLineView.prototype._drawLine = function (ctx, coordinates, styles) {\n        var _a;\n        if (styles.show) {\n            var lineStyles = styles.line;\n            if (lineStyles.show) {\n                (_a = this.createFigure({\n                    name: \'line\',\n                    attrs: { coordinates: coordinates },\n                    styles: lineStyles\n                })) === null || _a === void 0 ? void 0 : _a.draw(ctx);\n            }\n        }\n    };';
        if (content.includes(esmDrawLinePattern)) {
          content = content.replace(esmDrawLinePattern, esmDrawLineReplacement);
          modified = true;
          console.log(`Successfully patched CrosshairLineView draw in ${fileName}`);
        }
      }
    }

    // 6d. Tool anchor point and overlay drawing follow crosshair crossing point
    {
      const drawOverlaySearchPattern = `            var dataIndex = null;
            if (isContinuous && isNumber(point.timestamp)) {
                // Use timestampToFloatIndex for sub-bar precision
                dataIndex = chartStore.timestampToFloatIndex(point.timestamp);
            }
            else if (isNumber(point.timestamp)) {
                // For regular overlays, use integer timestamp lookup
                dataIndex = chartStore.timestampToDataIndex(point.timestamp);
            }
            else if (isNumber(point.dataIndex)) {
                // Fallback to dataIndex if no timestamp
                dataIndex = point.dataIndex;
            }`;
      const drawOverlayReplacement = `            /* __overlay_float_dataindex_draw_patched__ */
            var dataIndex = null;
            if (isContinuous && isNumber(point.timestamp)) {
                if (typeof chartStore.timestampToFloatIndex === 'function') {
                    dataIndex = chartStore.timestampToFloatIndex(point.timestamp);
                } else if (typeof chartStore.timestampToDataIndex === 'function') {
                    dataIndex = chartStore.timestampToDataIndex(point.timestamp);
                }
            } else if (isNumber(point.dataIndex)) {
                dataIndex = point.dataIndex;
            } else if (isNumber(point.timestamp)) {
                dataIndex = chartStore.timestampToDataIndex(point.timestamp);
            }`;
      if (content.includes(drawOverlaySearchPattern)) {
        content = content.replace(drawOverlaySearchPattern, drawOverlayReplacement);
        modified = true;
        console.log(`Successfully patched overlay float dataIndex drawing in ${fileName}`);
      } else {
        const oldDrawOverlayPat = /\/\*\s*__overlay_float_dataindex_draw_patched__\s*\*\/[\s\S]*?if\s*\(!isNumber\(dataIndex\)\s*&&\s*isNumber\(point\.dataIndex\)\)\s*\{\s*dataIndex\s*=\s*point\.dataIndex;\s*\}/;
        if (oldDrawOverlayPat.test(content)) {
          content = content.replace(oldDrawOverlayPat, drawOverlayReplacement.trim());
          modified = true;
          console.log(`Successfully updated overlay float dataIndex drawing in ${fileName}`);
        }
      }
    }

    // 6d2. Make tool anchor point follow the crosshair crossing point
    if (content.includes('OverlayView.prototype._coordinateToPoint = function')) {
      const coordStart = content.indexOf('OverlayView.prototype._coordinateToPoint = function');
      const coordEnd = content.indexOf('OverlayView.prototype.coordinateToPointValueFlag = function', coordStart);
      if (coordStart !== -1 && coordEnd !== -1) {
        const fullMatch = content.slice(coordStart, coordEnd);
        const replacement = `OverlayView.prototype._coordinateToPoint = function (o, coordinate) {
        /* __tool_crosshair_crossing_point_patched__ */
        var point = {};
        var pane = this.getWidget().getPane();
        var chart = pane.getChart();
        var paneId = pane.getId();
        var chartStore = chart.getChartStore();
        var crosshair = chartStore.getCrosshair();
        if (this.coordinateToPointTimestampDataIndexFlag()) {
            var xAxis = chart.getXAxisPane().getXAxisComponent();
            var dataIndex = xAxis.convertFromPixel(coordinate.x);
            if (typeof dataIndex !== 'number' || isNaN(dataIndex)) {
                dataIndex = chartStore.coordinateToFloatIndex(coordinate.x);
            }
            point.dataIndex = dataIndex;
            var ts = chartStore.dataIndexToTimestamp(dataIndex);
            if (typeof ts !== 'number' || !isFinite(ts)) {
                if (crosshair && typeof crosshair.timestamp === 'number' && isFinite(crosshair.timestamp)) {
                    ts = crosshair.timestamp;
                }
            }
            point.timestamp = (typeof ts === 'number' && isFinite(ts)) ? ts : undefined;
        }
        if (this.coordinateToPointValueFlag()) {
            var yAxis = pane.getYAxisComponentById();
            var value = yAxis.convertFromPixel(coordinate.y);
            if (o.mode !== 'normal' && paneId === PaneIdConstants.CANDLE && isNumber(point.dataIndex)) {
                var kLineData = chartStore.getDataByDataIndex(point.dataIndex);
                if (kLineData !== null) {
                    var modeSensitivity = o.modeSensitivity;
                    if (value > kLineData.high) {
                        if (o.mode === 'weak_magnet') {
                            var highY = yAxis.convertToPixel(kLineData.high);
                            var buffValueY = yAxis.reverse ? highY + modeSensitivity : highY - modeSensitivity;
                            var buffValue = yAxis.convertFromPixel(buffValueY);
                            if (value < buffValue) {
                                value = kLineData.high;
                            }
                        }
                        else {
                            value = kLineData.high;
                        }
                    }
                    else if (value < kLineData.low) {
                        if (o.mode === 'weak_magnet') {
                            var lowY = yAxis.convertToPixel(kLineData.low);
                            var buffValueY = yAxis.reverse ? lowY - modeSensitivity : lowY + modeSensitivity;
                            var buffValue = yAxis.convertFromPixel(buffValueY);
                            if (value > buffValue) {
                                value = kLineData.low;
                            }
                        }
                        else {
                            value = kLineData.low;
                        }
                    }
                    else {
                        var max = Math.max(kLineData.open, kLineData.close);
                        var min = Math.min(kLineData.open, kLineData.close);
                        if (value > max) {
                            if (value - max < kLineData.high - value) {
                                value = max;
                            }
                            else {
                                value = kLineData.high;
                            }
                        }
                        else if (value < min) {
                            if (value - kLineData.low < min - value) {
                                value = kLineData.low;
                            }
                            else {
                                value = min;
                            }
                        }
                        else if (max - value < value - min) {
                            value = max;
                        }
                        else {
                            value = min;
                        }
                    }
                }
            }
            point.value = value;
        }
        return point;
    };
    `;
        content = content.replace(fullMatch, replacement);
        modified = true;
        console.log(`Successfully patched entire _coordinateToPoint in ${fileName}`);
      }
    }

    // 6e. Maintain Active Crosshair Center During Point Dragging
    if (content.includes('__crosshair_drag_preupdate_patched__')) {
      const targetSnippet = `if (!consumed) {\n                        this._processMainScrollingEvent(widget, event_3);`;
      const targetSnippet2 = `if (!consumed) {\n                            this._processMainScrollingEvent(widget, event_3);`;
      const replacementSnippet = `if (!consumed) {\n                        if (!(typeof window !== 'undefined' && window.__is_position_dragging__)) {\n                            this._processMainScrollingEvent(widget, event_3);\n                        }`;
      if (content.includes(targetSnippet)) {
        content = content.replace(targetSnippet, replacementSnippet);
        modified = true;
        console.log(`Successfully added position dragging guard to __crosshair_drag_preupdate_patched__ in ${fileName}`);
      } else if (content.includes(targetSnippet2)) {
        content = content.replace(targetSnippet2, replacementSnippet);
        modified = true;
        console.log(`Successfully added position dragging guard to __crosshair_drag_preupdate_patched__ in ${fileName}`);
      }
    } else if (content.includes('WidgetNameConstants.MAIN')) {
      const idx = content.indexOf('Event.prototype.pressedMouseMoveEvent');
      if (idx !== -1) {
        const sub = content.slice(idx, idx + 2500);
        const mainIdx = sub.indexOf('case WidgetNameConstants.MAIN:');
        if (mainIdx !== -1) {
          const mainBlockEnd = sub.indexOf('return consumed;', mainIdx);
          if (mainBlockEnd !== -1) {
            const endBrace = sub.indexOf('}', mainBlockEnd);
            if (endBrace !== -1) {
              const fullMatch = sub.slice(mainIdx, endBrace + 1);
              const replacement = `case WidgetNameConstants.MAIN: {
                    /* __crosshair_drag_preupdate_patched__ */
                    var crosshair = { x: event_3.x, y: event_3.y, paneId: pane === null || pane === void 0 ? void 0 : pane.getId() };
                    if (pane) {
                        this._chart.getChartStore().setCrosshair(crosshair, { notInvalidate: true });
                    }
                    var consumed = widget.dispatchEvent('pressedMouseMoveEvent', event_3);
                    if (!consumed) {
                        if (!(typeof window !== 'undefined' && window.__is_position_dragging__)) {
                            this._processMainScrollingEvent(widget, event_3);
                        }
                    } else {
                        this._chart.updatePane(1 /* UpdateLevel.Overlay */);
                    }
                    this._chart.getChartStore().setCrosshair(crosshair, { forceInvalidate: true });
                    return consumed;
                }`;
              content = content.replace(fullMatch, replacement);
              modified = true;
              console.log(`Successfully updated crosshair active during point drag in ${fileName}`);
            }
          }
        }
      }
    }

    // 6f. Immediate response when holding and moving crosshair (no deadzone/freeze threshold)
    if (!content.includes('__immediate_pressed_move_patched__')) {
      const esmDownMovePattern = `    EventHandlerImp.prototype._mouseMoveWithDownHandler = function (moveEvent) {
        if (moveEvent.button !== MouseEventButton.Left) {
            return;
        }
        var moveInfo = this._mouseTouchMoveWithDownInfo(this._getCoordinate(moveEvent), this._mouseMoveStartCoordinate);
        var manhattanDistance = moveInfo.manhattanDistance;
        if (manhattanDistance >= ManhattanDistance.CancelClick) {
            // if manhattan distance is more that 5 - we should cancel click event
            this._cancelClick = true;
            this._resetClickTimeout();
        }
        if (this._cancelClick) {
            // if this._cancelClick is true, that means that minimum manhattan distance is already exceeded
            this._processEvent(this._makeCompatEvent(moveEvent), this._handler.pressedMouseMoveEvent);
        }
    };`;
      const esmDownMoveReplacement = `    /* __immediate_pressed_move_patched__ */ EventHandlerImp.prototype._mouseMoveWithDownHandler = function (moveEvent) {
        if (moveEvent.button !== MouseEventButton.Left) {
            return;
        }
        var moveInfo = this._mouseTouchMoveWithDownInfo(this._getCoordinate(moveEvent), this._mouseMoveStartCoordinate);
        if (moveInfo.manhattanDistance >= 1) {
            this._cancelClick = true;
            this._resetClickTimeout();
        }
        this._processEvent(this._makeCompatEvent(moveEvent), this._handler.pressedMouseMoveEvent);
    };`;
      if (content.includes(esmDownMovePattern)) {
        content = content.replace(esmDownMovePattern, esmDownMoveReplacement);
        modified = true;
        console.log(`Successfully patched immediate pressed mouse move response in ${fileName}`);
      }
    }

    // 6g. Immediate crosshair lock on mouseDown
    if (!content.includes('__mousedown_crosshair_lock_patched__')) {
      const esmMouseDownMainPattern = `                case WidgetNameConstants.MAIN: {
                    // Dispatch event first to allow overlays (e.g., continuous drawing) to consume it
                    var consumed = widget.dispatchEvent('mouseDownEvent', event_2);`;
      const esmMouseDownMainReplacement = `                case WidgetNameConstants.MAIN: {
                    /* __mousedown_crosshair_lock_patched__ */
                    if (pane) {
                        this._chart.getChartStore().setCrosshair({ x: event_2.x, y: event_2.y, paneId: pane.getId() }, { forceInvalidate: true });
                    }
                    // Dispatch event first to allow overlays (e.g., continuous drawing) to consume it
                    var consumed = widget.dispatchEvent('mouseDownEvent', event_2);`;
      if (new RegExp(esmMouseDownMainPattern.replace(/\s+/g, '\\s+')).test(content)) {
        content = content.replace(esmMouseDownMainPattern, esmMouseDownMainReplacement);
        modified = true;
        console.log(`Successfully patched mouseDown crosshair lock in ${fileName}`);
      }
    }

    // 6h. Snap crosshair line and X-axis time label to candle wick (center of candle bar) instead of floating in between candles
    if (!content.includes('__crosshair_wick_snap_patched__')) {
      const snapCrosshairPattern = /\/\*\s*__crosshair_free_move_patched__\s*\*\/[\s\S]*?var\s+realX\s*=\s*isNumber\(cr\.x\)\s*\?\s*cr\.x\s*:\s*this\.dataIndexToCoordinate\(realDataIndex\);/;
      const snapCrosshairReplacement = `/* __crosshair_wick_snap_patched__ */
        var realX = Math.round(this.dataIndexToCoordinate(realDataIndex));`;

      if (snapCrosshairPattern.test(content)) {
        content = content.replace(snapCrosshairPattern, snapCrosshairReplacement);
        modified = true;
        console.log(`Successfully patched setCrosshair to snap to candle wick in ${fileName}`);
      } else {
        const setCrosshairPattern = /var\s+realX\s*=\s*isNumber\(cr\.x\)\s*\?\s*cr\.x\s*:\s*this\.dataIndexToCoordinate\(realDataIndex\);/;
        if (setCrosshairPattern.test(content)) {
          content = content.replace(setCrosshairPattern, `/* __crosshair_wick_snap_patched__ */ var realX = Math.round(this.dataIndexToCoordinate(realDataIndex));`);
          modified = true;
          console.log(`Successfully patched setCrosshair to snap to candle wick in ${fileName}`);
        }
      }

      const crosshairLineXPattern = /var\s+x\s*=\s*\(typeof\s+crosshair\.x\s*===\s*["']number["']\s*\?\s*crosshair\.x\s*:\s*crosshair\.realX\);(\s*this\._drawLine\(ctx,\s*\[\s*\{\s*x:\s*x,\s*y:\s*0\s*\},)/;
      if (crosshairLineXPattern.test(content)) {
        content = content.replace(crosshairLineXPattern, `var x = (typeof crosshair.realX === "number" ? crosshair.realX : crosshair.x);$1`);
        modified = true;
        console.log(`Successfully patched CrosshairLineView to align with candle wick in ${fileName}`);
      }

      const crosshairLabelXPattern = /CrosshairVerticalLabelView\.prototype\.getTextAttrs\s*=\s*function\s*\(text,\s*textWidth,\s*crosshair,\s*bounding,\s*_axis,\s*styles\)\s*\{\s*var\s+x\s*=\s*\(typeof\s+crosshair\.x\s*===\s*["']number["']\s*\?\s*crosshair\.x\s*:\s*crosshair\.realX\);/;
      if (crosshairLabelXPattern.test(content)) {
        content = content.replace(crosshairLabelXPattern, `CrosshairVerticalLabelView.prototype.getTextAttrs = function (text, textWidth, crosshair, bounding, _axis, styles) {
        var x = (typeof crosshair.realX === "number" ? crosshair.realX : crosshair.x);`);
        modified = true;
        console.log(`Successfully patched CrosshairVerticalLabelView to align with candle wick in ${fileName}`);
      }
    }

    // 6i. Fix coordinateToDataIndex duplicate definition (Math.ceil(x)-1 -> Math.round(x))
    {
      const badCoordToDataIdx = `    StoreImp.prototype.coordinateToDataIndex = function (x) {
        return Math.ceil(this.coordinateToFloatIndex(x)) - 1;
    };`;
      const fixedCoordToDataIdx = `    /* __coord_to_dataindex_round_patched__ */ StoreImp.prototype.coordinateToDataIndex = function (x) {
        return Math.round(this.coordinateToFloatIndex(x));
    };`;
      if (content.includes(badCoordToDataIdx)) {
        content = content.replace(badCoordToDataIdx, fixedCoordToDataIdx);
        modified = true;
        console.log(`Successfully fixed coordinateToDataIndex off-by-one in ${fileName}`);
      }
    }

    // 6j. Patch mouseClickEvent to pre-set crosshair before overlay dispatch
    if (!content.includes('__mouseclick_crosshair_preset_patched__')) {
      const clickPattern = `Event.prototype.mouseClickEvent = function (e) {
        var widget = this._findWidgetByEvent(e).widget;
        if (widget !== null) {
            var event_5 = this._makeWidgetEvent(e, widget);
            return widget.dispatchEvent('mouseClickEvent', event_5);
        }
        return false;
    };`;
      const clickReplacement = `Event.prototype.mouseClickEvent = function (e) {
        /* __mouseclick_crosshair_preset_patched__ */
        var _a = this._findWidgetByEvent(e), pane = _a.pane, widget = _a.widget;
        if (widget !== null) {
            var event_5 = this._makeWidgetEvent(e, widget);
            var name_5 = widget.getName();
            if (name_5 === WidgetNameConstants.MAIN && pane) {
                this._chart.getChartStore().setCrosshair({ x: event_5.x, y: event_5.y, paneId: pane.getId() }, { notInvalidate: true });
            }
            return widget.dispatchEvent('mouseClickEvent', event_5);
        }
        return false;
    };`;
      if (content.includes(clickPattern)) {
        content = content.replace(clickPattern, clickReplacement);
        modified = true;
        console.log(`Successfully patched mouseClickEvent crosshair pre-set in ${fileName}`);
      }
    }

    // 7. Future timestamp and dataIndex extensions for unbounded anchor placement
    {
      const storeMatch = content.match(/this\._chartStore\s*=\s*new\s+([a-zA-Z0-9$_]+)/);
      const storeName = (fileName === kcName + '.min.js') ? (storeMatch ? storeMatch[1] : 'jt') : 'StoreImp';
      const futureShims = `
      /* __future_anchor_unbounded_patched__ */
      if (!${storeName}.prototype.getDataList) {
          ${storeName}.prototype.getDataList = function () {
              return this._dataList || [];
          };
      }
      if (!${storeName}.prototype.getPeriod) {
          ${storeName}.prototype.getPeriod = function () {
              return this._period;
          };
      }
      if (!${storeName}.prototype.getVisibleRangeDataList) {
          ${storeName}.prototype.getVisibleRangeDataList = function () {
              return this._visibleRangeDataList || [];
          };
      }
      if (!${storeName}.prototype.getVisibleRangeHighLowPrice) {
          ${storeName}.prototype.getVisibleRangeHighLowPrice = function () {
              return this._visibleRangeHighLowPrice || [{ price: -Infinity, x: 0 }, { price: Infinity, x: 0 }];
          };
      }
      ${storeName}.prototype.dataIndexToTimestamp = function (dataIndex) {
          if (typeof dataIndex !== 'number' || isNaN(dataIndex)) return null;
          var length = this._dataList.length;
          if (length === 0) return null;
          var lastIndex = length - 1;
          var lastTimestamp = this._dataList[lastIndex].timestamp;
          var firstTimestamp = this._dataList[0].timestamp;
          var barDuration = 60000;
          if (length >= 2) {
              barDuration = Math.max(1000, lastTimestamp - this._dataList[lastIndex - 1].timestamp);
          } else if (this._period) {
              var mult = this._period.multiplier || this._period.span || 1;
              var tspan = this._period.timespan || this._period.type || 'minute';
              if (tspan === 'second') barDuration = mult * 1000;
              else if (tspan === 'minute') barDuration = mult * 60000;
              else if (tspan === 'hour') barDuration = mult * 3600000;
              else if (tspan === 'day') barDuration = mult * 86400000;
              else if (tspan === 'week') barDuration = mult * 7 * 86400000;
              else if (tspan === 'month') barDuration = mult * 30 * 86400000;
              else if (tspan === 'year') barDuration = mult * 365 * 86400000;
          }
          if (dataIndex > lastIndex) {
              return Math.round(lastTimestamp + (dataIndex - lastIndex) * barDuration);
          }
          if (dataIndex < 0) {
              return Math.round(firstTimestamp + dataIndex * barDuration);
          }
          var baseIndex = Math.floor(dataIndex);
          var fraction = dataIndex - baseIndex;
          if (baseIndex >= lastIndex || fraction === 0) {
              return this._dataList[baseIndex] ? this._dataList[baseIndex].timestamp : lastTimestamp;
          }
          var curTs = this._dataList[baseIndex].timestamp;
          var nextTs = this._dataList[baseIndex + 1] ? this._dataList[baseIndex + 1].timestamp : (curTs + barDuration);
          return Math.round(curTs + fraction * (nextTs - curTs));
      };
      ${storeName}.prototype.timestampToDataIndex = function (timestamp) {
          if (typeof timestamp !== 'number' || isNaN(timestamp)) return 0;
          var length = this._dataList.length;
          if (length === 0) return 0;
          var lastIndex = length - 1;
          var lastTimestamp = this._dataList[lastIndex].timestamp;
          var firstTimestamp = this._dataList[0].timestamp;
          var barDuration = 60000;
          if (length >= 2) {
              barDuration = Math.max(1000, lastTimestamp - this._dataList[lastIndex - 1].timestamp);
          } else if (this._period) {
              var mult = this._period.multiplier || this._period.span || 1;
              var tspan = this._period.timespan || this._period.type || 'minute';
              if (tspan === 'second') barDuration = mult * 1000;
              else if (tspan === 'minute') barDuration = mult * 60000;
              else if (tspan === 'hour') barDuration = mult * 3600000;
              else if (tspan === 'day') barDuration = mult * 86400000;
              else if (tspan === 'week') barDuration = mult * 7 * 86400000;
              else if (tspan === 'month') barDuration = mult * 30 * 86400000;
              else if (tspan === 'year') barDuration = mult * 365 * 86400000;
          }
          if (timestamp > lastTimestamp) {
              return lastIndex + (timestamp - lastTimestamp) / barDuration;
          }
          if (timestamp < firstTimestamp) {
              return (timestamp - firstTimestamp) / barDuration;
          }
          var l = 0, r = length - 1;
          while (l <= r) {
              var m = Math.floor((l + r) / 2);
              if (this._dataList[m].timestamp === timestamp) return m;
              if (this._dataList[m].timestamp < timestamp) l = m + 1;
              else r = m - 1;
          }
          if (r < 0) return 0;
          if (l >= length) return lastIndex;
          var t1 = this._dataList[r].timestamp;
          var t2 = this._dataList[l].timestamp;
          if (t2 === t1) return r;
          return r + (timestamp - t1) / (t2 - t1);
      };
      ${storeName}.prototype.timestampToFloatIndex = ${storeName}.prototype.timestampToDataIndex;

      var _fastTzOffsetCache = {};
      function _getFastTzOffsetMs(tz, ts) {
          if (!tz) tz = (typeof window !== 'undefined' && window.__custom_timezone__) || 'Asia/Kolkata';
          var now = Date.now();
           if (_fastTzOffsetCache[tz] && (now - _fastTzOffsetCache[tz].time < 300000)) {
               return _fastTzOffsetCache[tz].offset;
           }
           try {
               var refTs = typeof ts === 'number' && !isNaN(ts) ? ts : now;
               var d = new Date(refTs);
               var fmt = new Intl.DateTimeFormat('en-US', {
                   timeZone: tz,
                   year: 'numeric', month: 'numeric', day: 'numeric',
                   hour: 'numeric', minute: 'numeric', second: 'numeric',
                   hour12: false
               });
               var parts = fmt.formatToParts(d);
               var pm = {};
               for (var i = 0; i < parts.length; i++) pm[parts[i].type] = parts[i].value;
               var h = parseInt(pm.hour, 10);
               if (h === 24) h = 0;
               var localAsUtc = Date.UTC(
                   parseInt(pm.year, 10),
                   parseInt(pm.month, 10) - 1,
                   parseInt(pm.day, 10),
                   h,
                   parseInt(pm.minute, 10),
                   parseInt(pm.second, 10)
               );
               var offset = localAsUtc - refTs;
               _fastTzOffsetCache[tz] = { offset: offset, time: now };
               return offset;
           } catch(e) {
               var fallbackOffset = -new Date().getTimezoneOffset() * 60000;
               _fastTzOffsetCache[tz] = { offset: fallbackOffset, time: now };
               return fallbackOffset;
           }
       }
       function _getFastCivilParts(ts, tzOffsetMs) {
           var tsLocal = ts + tzOffsetMs;
           var day = Math.floor(tsLocal / 86400000);
           var msOfDay = tsLocal % 86400000;
           if (msOfDay < 0) {
               msOfDay += 86400000;
               day -= 1;
           }
           var z = day + 719468;
           var era = Math.floor((z >= 0 ? z : z - 146096) / 146097);
           var doe = z - era * 146097;
           var yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
           var y = yoe + era * 400;
           var doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
           var mp = Math.floor((5 * doy + 2) / 153);
           var d = doy - Math.floor((153 * mp + 2) / 5) + 1;
           var m = mp < 10 ? mp + 2 : mp - 10;
           if (m <= 1) y += 1;
           
           var hour = Math.floor(msOfDay / 3600000);
           var minute = Math.floor((msOfDay % 3600000) / 60000);
           var second = Math.floor((msOfDay % 60000) / 1000);
           return { y: y, m: m, d: d, hour: hour, minute: minute, second: second };
       }

        if (typeof XAxisImp !== 'undefined') {
            XAxisImp.prototype.createTicksImp = function () {
                var _b = this.getRange(), realFrom = _b.realFrom, realTo = _b.realTo, from = _b.from;
                var chartStore = this.getParent().getChart().getChartStore();
                var formatDate = chartStore.getInnerFormatter().formatDate;
                var period = chartStore.getPeriod();
                var bounding = this.getBounding();
                var width = bounding.width || 800;
                var barSpace = chartStore.getBarSpace().bar;
                var dataList = chartStore.getDataList ? chartStore.getDataList() : [];
                var totalBars = dataList.length;

                var fromIdx = Math.floor(realFrom);
                var toIdx = Math.ceil(realTo);
                var tz = (typeof window !== 'undefined' ? window.__custom_timezone__ : undefined) || 'Asia/Kolkata';
                var tzOffsetMs = _getFastTzOffsetMs(tz);

                var mult = (period && (period.multiplier || period.span)) || 1;
                var tspan = (period && (period.timespan || period.type)) || 'minute';
                var isIntraday = (tspan === 'second' || tspan === 'minute' || tspan === 'hour');
                var isDay = (tspan === 'day');
                var isWeek = (tspan === 'week');
                var isMonth = (tspan === 'month');
                var isYear = (tspan === 'year');

                var barDuration = 60000;
                if (totalBars >= 2) {
                    barDuration = Math.max(1000, dataList[totalBars - 1].timestamp - dataList[totalBars - 2].timestamp);
                } else {
                    if (tspan === 'second') barDuration = mult * 1000;
                    else if (tspan === 'minute') barDuration = mult * 60000;
                    else if (tspan === 'hour') barDuration = mult * 3600000;
                    else if (tspan === 'day') barDuration = mult * 86400000;
                    else if (tspan === 'week') barDuration = mult * 7 * 86400000;
                    else if (tspan === 'month') barDuration = mult * 30 * 86400000;
                    else if (tspan === 'year') barDuration = mult * 365 * 86400000;
                }

                // Minimum pixel spacing between adjacent tick labels
                var minSpacingPx = 75;
                var targetTickCount = Math.max(4, Math.min(18, Math.floor(width / 90)));

                var STEP_LADDER = [
                    { unit: 'sec', step: 1, ms: 1000 },
                    { unit: 'sec', step: 5, ms: 5000 },
                    { unit: 'sec', step: 10, ms: 10000 },
                    { unit: 'sec', step: 15, ms: 15000 },
                    { unit: 'sec', step: 30, ms: 30000 },
                    { unit: 'min', step: 1, ms: 60000 },
                    { unit: 'min', step: 2, ms: 120000 },
                    { unit: 'min', step: 3, ms: 180000 },
                    { unit: 'min', step: 5, ms: 300000 },
                    { unit: 'min', step: 10, ms: 600000 },
                    { unit: 'min', step: 15, ms: 900000 },
                    { unit: 'min', step: 30, ms: 1800000 },
                    { unit: 'min', step: 45, ms: 2700000 },
                    { unit: 'hour', step: 1, ms: 3600000 },
                    { unit: 'hour', step: 2, ms: 7200000 },
                    { unit: 'hour', step: 3, ms: 10800000 },
                    { unit: 'hour', step: 4, ms: 14400000 },
                    { unit: 'hour', step: 6, ms: 21600000 },
                    { unit: 'hour', step: 12, ms: 43200000 },
                    { unit: 'day', step: 1, ms: 86400000 },
                    { unit: 'day', step: 2, ms: 172800000 },
                    { unit: 'day', step: 3, ms: 259200000 },
                    { unit: 'day', step: 5, ms: 432000000 },
                    { unit: 'day', step: 7, ms: 604800000 },
                    { unit: 'day', step: 10, ms: 864000000 },
                    { unit: 'day', step: 15, ms: 1296000000 },
                    { unit: 'month', step: 1, ms: 2592000000 },
                    { unit: 'month', step: 2, ms: 5184000000 },
                    { unit: 'month', step: 3, ms: 7776000000 },
                    { unit: 'month', step: 6, ms: 15552000000 },
                    { unit: 'year', step: 1, ms: 31536000000 },
                    { unit: 'year', step: 2, ms: 63072000000 },
                    { unit: 'year', step: 5, ms: 157680000000 },
                    { unit: 'year', step: 10, ms: 315360000000 }
                ];

                var tStart = chartStore.dataIndexToTimestamp(fromIdx) || (dataList[0] ? dataList[0].timestamp : 0);
                var tEnd = chartStore.dataIndexToTimestamp(toIdx) || (tStart + (toIdx - fromIdx) * barDuration);
                var timeSpan = Math.max(barDuration, tEnd - tStart);
                var idealStepMs = timeSpan / targetTickCount;

                var chosenStep = STEP_LADDER[STEP_LADDER.length - 1];
                for (var si = 0; si < STEP_LADDER.length; si++) {
                    var s = STEP_LADDER[si];
                    var estBars = Math.max(1, Math.round(s.ms / barDuration));
                    var estPx = estBars * barSpace;
                    if (s.ms >= idealStepMs && estPx >= minSpacingPx) {
                        chosenStep = s;
                        break;
                    }
                }

                function isStepBoundary(parts, prevParts, step) {
                    if (!prevParts) return false;
                    if (step.unit === 'year') {
                        return (parts.y !== prevParts.y) && ((parts.y % step.step) === 0);
                    }
                    if (step.unit === 'month') {
                        if (parts.y !== prevParts.y) return true;
                        if (parts.m !== prevParts.m) {
                            return (parts.m % step.step) === 0;
                        }
                        return false;
                    }
                    if (step.unit === 'day') {
                        if (parts.y !== prevParts.y || parts.m !== prevParts.m) return true;
                        if (parts.d !== prevParts.d) {
                            if (step.step === 1) return true;
                            if (step.step === 15) return parts.d === 1 || (parts.d >= 15 && prevParts.d < 15);
                            if (step.step === 10) return parts.d === 1 || (parts.d >= 10 && prevParts.d < 10) || (parts.d >= 20 && prevParts.d < 20);
                            if (step.step === 5) return parts.d === 1 || (parts.d % 5 === 0);
                            return (parts.d % step.step === 0);
                        }
                        return false;
                    }
                    if (step.unit === 'hour') {
                        if (parts.y !== prevParts.y || parts.m !== prevParts.m || parts.d !== prevParts.d) return true;
                        if (parts.hour !== prevParts.hour) {
                            return (parts.hour % step.step) === 0;
                        }
                        return false;
                    }
                    if (step.unit === 'min') {
                        if (parts.y !== prevParts.y || parts.m !== prevParts.m || parts.d !== prevParts.d || parts.hour !== prevParts.hour) return true;
                        if (parts.minute !== prevParts.minute) {
                            return (parts.minute % step.step) === 0;
                        }
                        return false;
                    }
                    if (step.unit === 'sec') {
                        if (parts.y !== prevParts.y || parts.m !== prevParts.m || parts.d !== prevParts.d || parts.hour !== prevParts.hour || parts.minute !== prevParts.minute) return true;
                        if (parts.second !== prevParts.second) {
                            return (parts.second % step.step) === 0;
                        }
                        return false;
                    }
                    return false;
                }

                function getTimestampForIndex(idx) {
                    if (totalBars === 0) return null;
                    return chartStore.dataIndexToTimestamp(idx);
                }

                var ticks = [];
                var prevParts = null;

                if (isWeek) {
                    // 1. Weekly charts: symmetric month-level tick distribution (supporting past and future)
                    var idealBars = Math.max(1, Math.round(minSpacingPx / barSpace));
                    var monthGroups = [];
                    var curGroup = null;

                    var loopStart = fromIdx - 50;
                    var loopEnd = toIdx + 50;
                    var prevP = null;

                    for (var idx = loopStart; idx <= loopEnd; idx++) {
                        var ts = getTimestampForIndex(idx);
                        if (typeof ts !== 'number' || !isFinite(ts)) continue;
                        var parts = _getFastCivilParts(ts, tzOffsetMs);

                        if (!prevP || parts.m !== prevP.m || parts.y !== prevP.y) {
                            if (curGroup) {
                                curGroup.endIdx = idx - 1;
                                monthGroups.push(curGroup);
                            }
                            curGroup = {
                                startIdx: idx,
                                endIdx: idx,
                                y: parts.y,
                                m: parts.m,
                                isNewYear: !prevP || (parts.y !== prevP.y)
                            };
                        } else {
                            if (curGroup) curGroup.endIdx = idx;
                        }
                        prevP = parts;
                    }
                    if (curGroup) monthGroups.push(curGroup);

                    if (idealBars >= 35) {
                        // Zoomed out max: only show Years (YYYY)
                        var yearStep = Math.max(1, Math.round(idealBars / 52));
                        for (var mi = 0; mi < monthGroups.length; mi++) {
                            var mg = monthGroups[mi];
                            if ((mg.isNewYear || mg.m === 0) && (mg.y % yearStep === 0)) {
                                if (mg.startIdx >= fromIdx - 2 && mg.startIdx <= toIdx + 2) {
                                    var ts = getTimestampForIndex(mg.startIdx);
                                    var template = 'YYYY';
                                    var coord = this.convertToPixel(mg.startIdx);
                                    var text = '';
                                    try { text = formatDate(ts, template, 'xAxis'); } catch(e) { text = ''; }
                                    if (text) {
                                        ticks.push({ coord: coord, value: ts, template: template, text: text });
                                    }
                                }
                            }
                        }
                    } else if (idealBars > 2) {
                        // Step-by-step month zoom: 6M, 3M, 2M, or 1M per tick
                        var monthStep = 1;
                        if (idealBars >= 20) monthStep = 6;
                        else if (idealBars >= 10) monthStep = 3;
                        else if (idealBars >= 6) monthStep = 2;
                        else monthStep = 1;

                        for (var mi = 0; mi < monthGroups.length; mi++) {
                            var mg = monthGroups[mi];
                            var shouldTick = false;

                            if (monthStep === 1) shouldTick = true;
                            else if (monthStep === 6) shouldTick = (mg.m % 6 === 0);
                            else if (monthStep === 3) shouldTick = (mg.m % 3 === 0);
                            else if (monthStep === 2) shouldTick = (mg.m % 2 === 0);

                            if (shouldTick && mg.startIdx >= fromIdx - 2 && mg.startIdx <= toIdx + 2) {
                                var ts = getTimestampForIndex(mg.startIdx);
                                var template = (mg.isNewYear || mg.m === 0) ? 'YYYY' : 'MMM';
                                var coord = this.convertToPixel(mg.startIdx);
                                var text = '';
                                try { text = formatDate(ts, template, 'xAxis'); } catch(e) { text = ''; }
                                if (text) {
                                    ticks.push({ coord: coord, value: ts, template: template, text: text });
                                }
                            }
                        }
                    } else {
                        // High zoom: 2 ticks per month or every week
                        for (var mi = 0; mi < monthGroups.length; mi++) {
                            var mg = monthGroups[mi];
                            var mLen = mg.endIdx - mg.startIdx + 1;
                            var K = (idealBars === 1) ? mLen : Math.max(1, Math.round(mLen / 2));
                            var subStep = mLen / K;

                            for (var ki = 0; ki < K; ki++) {
                                var tIdx = Math.min(mg.endIdx, Math.round(mg.startIdx + ki * subStep));
                                if (tIdx < fromIdx || tIdx > toIdx) continue;

                                var ts = getTimestampForIndex(tIdx);
                                var template = (ki === 0) ? ((mg.isNewYear || mg.m === 0) ? 'YYYY' : 'MMM') : 'DD';
                                var coord = this.convertToPixel(tIdx);
                                var text = '';
                                try { text = formatDate(ts, template, 'xAxis'); } catch(e) { text = ''; }
                                if (text) {
                                    ticks.push({ coord: coord, value: ts, template: template, text: text });
                                }
                            }
                        }
                    }
                } else if (isDay) {
                    // 2. Daily charts: multi-level zoom hierarchy (supporting past and future)
                    var idealStep = Math.max(1, Math.round(minSpacingPx / barSpace));
                    var monthGroups = [];
                    var curGroup = null;

                    var loopStart = fromIdx - 60;
                    var loopEnd = toIdx + 60;
                    var prevP = null;

                    for (var idx = loopStart; idx <= loopEnd; idx++) {
                        var ts = getTimestampForIndex(idx);
                        if (typeof ts !== 'number' || !isFinite(ts)) continue;
                        var parts = _getFastCivilParts(ts, tzOffsetMs);

                        if (!prevP || parts.m !== prevP.m || parts.y !== prevP.y) {
                            if (curGroup) {
                                curGroup.endIdx = idx - 1;
                                monthGroups.push(curGroup);
                            }
                            curGroup = {
                                startIdx: idx,
                                endIdx: idx,
                                y: parts.y,
                                m: parts.m,
                                isNewYear: !prevP || (parts.y !== prevP.y)
                            };
                        } else {
                            if (curGroup) curGroup.endIdx = idx;
                        }
                        prevP = parts;
                    }
                    if (curGroup) monthGroups.push(curGroup);

                    if (idealStep >= 180) {
                        // Zoomed out to maximum: only show Years (YYYY)
                        var yearStep = Math.max(1, Math.round(idealStep / 250));
                        for (var mi = 0; mi < monthGroups.length; mi++) {
                            var mg = monthGroups[mi];
                            if ((mg.isNewYear || mg.m === 0) && (mg.y % yearStep === 0)) {
                                if (mg.startIdx >= fromIdx - 5 && mg.startIdx <= toIdx + 5) {
                                    var ts = getTimestampForIndex(mg.startIdx);
                                    var template = 'YYYY';
                                    var coord = this.convertToPixel(mg.startIdx);
                                    var text = '';
                                    try { text = formatDate(ts, template, 'xAxis'); } catch(e) { text = ''; }
                                    if (text) {
                                        ticks.push({ coord: coord, value: ts, template: template, text: text });
                                    }
                                }
                            }
                        }
                    } else if (idealStep >= 18) {
                        // Zoomed out moderate: step by calendar months (1, 2, 3, 6 months)
                        var monthStep = 1;
                        if (idealStep >= 90) monthStep = 6;
                        else if (idealStep >= 50) monthStep = 3;
                        else if (idealStep >= 30) monthStep = 2;
                        else monthStep = 1;

                        for (var mi = 0; mi < monthGroups.length; mi++) {
                            var mg = monthGroups[mi];
                            var shouldTick = false;

                            if (monthStep === 1) shouldTick = true;
                            else if (monthStep === 6) shouldTick = (mg.m % 6 === 0);
                            else if (monthStep === 3) shouldTick = (mg.m % 3 === 0);
                            else if (monthStep === 2) shouldTick = (mg.m % 2 === 0);

                            if (shouldTick && mg.startIdx >= fromIdx - 5 && mg.startIdx <= toIdx + 5) {
                                var ts = getTimestampForIndex(mg.startIdx);
                                var template = (mg.isNewYear || mg.m === 0) ? 'YYYY' : 'MMM';
                                var coord = this.convertToPixel(mg.startIdx);
                                var text = '';
                                try { text = formatDate(ts, template, 'xAxis'); } catch(e) { text = ''; }
                                if (text) {
                                    ticks.push({ coord: coord, value: ts, template: template, text: text });
                                }
                            }
                        }
                    } else {
                        // Zoomed in: Month starts at start of month, intermediate dates spread evenly in between
                        for (var mi = 0; mi < monthGroups.length; mi++) {
                            var mg = monthGroups[mi];
                            var mLen = mg.endIdx - mg.startIdx + 1;
                            if (mLen <= 0) continue;

                            var K = Math.max(1, Math.round(mLen / idealStep));
                            var subStep = mLen / K;

                            for (var ki = 0; ki < K; ki++) {
                                var tIdx = Math.min(mg.endIdx, Math.round(mg.startIdx + ki * subStep));
                                if (tIdx < fromIdx || tIdx > toIdx) continue;

                                var ts = getTimestampForIndex(tIdx);
                                var template = (ki === 0) ? ((mg.isNewYear || mg.m === 0) ? 'YYYY' : 'MMM') : 'DD';

                                var coord = this.convertToPixel(tIdx);
                                var text = '';
                                try { text = formatDate(ts, template, 'xAxis'); } catch(e) { text = ''; }
                                if (text) {
                                    ticks.push({ coord: coord, value: ts, template: template, text: text });
                                }
                            }
                        }
                    }
                } else if (isMonth) {
                    // 3. Month charts: strictly anchored to January (YYYY) with symmetric calendar steps (supporting past and future)
                    var idealBars = Math.max(1, Math.round(minSpacingPx / barSpace));
                    var monthStep = 1;
                    var yearStep = 1;

                    if (idealBars >= 20) {
                        yearStep = Math.max(1, Math.round(idealBars / 12));
                    } else if (idealBars >= 10) {
                        monthStep = 12; // 1 tick per year (Jan)
                    } else if (idealBars >= 5) {
                        monthStep = 6;  // Jan, Jul
                    } else if (idealBars >= 3) {
                        monthStep = 3;  // Jan, Apr, Jul, Oct
                    } else if (idealBars >= 2) {
                        monthStep = 2;  // Jan, Mar, May, Jul, Sep, Nov
                    } else {
                        monthStep = 1;  // Every month
                    }

                    var loopStart = fromIdx - 2;
                    var loopEnd = toIdx + 2;

                    for (var idx = loopStart; idx <= loopEnd; idx++) {
                        var ts = getTimestampForIndex(idx);
                        if (typeof ts !== 'number' || !isFinite(ts)) continue;
                        var parts = _getFastCivilParts(ts, tzOffsetMs);

                        var shouldTick = false;
                        if (idealBars >= 20) {
                            shouldTick = (parts.m === 0) && (parts.y % yearStep === 0);
                        } else if (monthStep === 12) {
                            shouldTick = (parts.m === 0);
                        } else if (monthStep === 6) {
                            shouldTick = (parts.m % 6 === 0);
                        } else if (monthStep === 3) {
                            shouldTick = (parts.m % 3 === 0);
                        } else if (monthStep === 2) {
                            shouldTick = (parts.m % 2 === 0);
                        } else {
                            shouldTick = true;
                        }

                        if (shouldTick && idx >= fromIdx && idx <= toIdx) {
                            var template = (parts.m === 0) ? 'YYYY' : 'MMM';
                            var coord = this.convertToPixel(idx);
                            var text = '';
                            try { text = formatDate(ts, template, 'xAxis'); } catch(e) { text = ''; }
                            if (text) {
                                ticks.push({ coord: coord, value: ts, template: template, text: text });
                            }
                        }
                    }
                } else if (isYear) {
                    // 4. Year charts: anchored to year step
                    var idealBars = Math.max(1, Math.round(minSpacingPx / barSpace));
                    var yearStep = Math.max(1, idealBars);

                    var loopStart = fromIdx - 2;
                    var loopEnd = toIdx + 2;

                    for (var idx = loopStart; idx <= loopEnd; idx++) {
                        var ts = getTimestampForIndex(idx);
                        if (typeof ts !== 'number' || !isFinite(ts)) continue;
                        var parts = _getFastCivilParts(ts, tzOffsetMs);

                        if ((parts.y % yearStep === 0) && idx >= fromIdx && idx <= toIdx) {
                            var template = 'YYYY';
                            var coord = this.convertToPixel(idx);
                            var text = '';
                            try { text = formatDate(ts, template, 'xAxis'); } catch(e) { text = ''; }
                            if (text) {
                                ticks.push({ coord: coord, value: ts, template: template, text: text });
                            }
                        }
                    }
                } else {
                    // 2. Intraday charts: symmetric time ticks per date with hierarchical date transitions (supporting past and future)
                    var idealBars = Math.max(1, Math.round(minSpacingPx / barSpace));
                    if (idealBars <= 1) {
                        // Max zoom in: every candle bar gets an X-axis timestamp
                        for (var idx = Math.floor(fromIdx); idx <= Math.ceil(toIdx); idx++) {
                            var ts = getTimestampForIndex(idx);
                            if (typeof ts !== 'number' || !isFinite(ts)) continue;
                            var parts = _getFastCivilParts(ts, tzOffsetMs);

                            var template = 'HH:mm';
                            if (prevParts && parts.y !== prevParts.y) {
                                template = 'YYYY';
                            } else if (prevParts && parts.m !== prevParts.m) {
                                template = 'MMM';
                            } else if (prevParts && parts.d !== prevParts.d) {
                                template = 'DD';
                            } else {
                                template = (tspan === 'second' || barDuration < 60000) ? 'HH:mm:ss' : 'HH:mm';
                            }

                            var coord = this.convertToPixel(idx);
                            var text = '';
                            try { text = formatDate(ts, template, 'xAxis'); } catch(e) { text = ''; }
                            if (text) {
                                ticks.push({ coord: coord, value: ts, template: template, text: text });
                            }
                            prevParts = parts;
                        }
                    } else {
                        var loopStart = fromIdx - 1;
                        var loopEnd = toIdx + 1;

                        for (var idx = loopStart; idx <= loopEnd; idx++) {
                            var ts = getTimestampForIndex(idx);
                            if (typeof ts !== 'number' || !isFinite(ts)) continue;
                            var parts = _getFastCivilParts(ts, tzOffsetMs);

                            if (prevParts && idx >= fromIdx && idx <= toIdx) {
                                if (isStepBoundary(parts, prevParts, chosenStep)) {
                                    var template = 'HH:mm';
                                    if (parts.y !== prevParts.y) {
                                        template = 'YYYY';
                                    } else if (parts.m !== prevParts.m) {
                                        template = 'MMM';
                                    } else if (parts.d !== prevParts.d) {
                                        template = 'DD';
                                    } else {
                                        template = (chosenStep.unit === 'sec') ? 'HH:mm:ss' : 'HH:mm';
                                    }

                                    var coord = this.convertToPixel(idx);
                                    var text = '';
                                    try { text = formatDate(ts, template, 'xAxis'); } catch(e) { text = ''; }
                                    if (text) {
                                        ticks.push({ coord: coord, value: ts, template: template, text: text });
                                    }
                                }
                            }
                            prevParts = parts;
                        }

                        // Fallback for uniform spacing if step boundary was sparse
                        if (ticks.length < 2 && totalBars > 0) {
                            ticks = [];
                            var gridStepBars = Math.max(1, Math.round(minSpacingPx / barSpace));
                            var startIdx = Math.floor(fromIdx / gridStepBars) * gridStepBars;
                            prevParts = null;

                            for (var idx = startIdx; idx <= toIdx + gridStepBars; idx += gridStepBars) {
                                if (idx < fromIdx || idx > toIdx) continue;
                                var ts = getTimestampForIndex(idx);
                                if (typeof ts !== 'number' || !isFinite(ts)) continue;
                                var parts = _getFastCivilParts(ts, tzOffsetMs);

                                var template = 'HH:mm';
                                if (prevParts && parts.y !== prevParts.y) {
                                    template = 'YYYY';
                                } else if (prevParts && parts.m !== prevParts.m) {
                                    template = 'MMM';
                                } else if (prevParts && parts.d !== prevParts.d) {
                                    template = 'DD';
                                } else {
                                    template = (chosenStep && chosenStep.unit === 'sec') ? 'HH:mm:ss' : 'HH:mm';
                                }

                                var coord = this.convertToPixel(idx);
                                var text = '';
                                try { text = formatDate(ts, template, 'xAxis'); } catch(e) { text = ''; }
                                if (text) {
                                    ticks.push({ coord: coord, value: ts, template: template, text: text });
                                }
                                prevParts = parts;
                            }
                        }
                    }
                }

                // Guaranteed non-empty ticks when chart has bars visible
                if (ticks.length === 0 && totalBars > 0) {
                    for (var idx = Math.floor(fromIdx); idx <= Math.ceil(toIdx); idx++) {
                        var ts = getTimestampForIndex(idx);
                        if (typeof ts === 'number' && isFinite(ts)) {
                            var coord = this.convertToPixel(idx);
                            var template = isIntraday ? 'HH:mm' : 'DD';
                            var text = '';
                            try { text = formatDate(ts, template, 'xAxis'); } catch(e) { text = ''; }
                            if (text) {
                                ticks.push({ coord: coord, value: ts, template: template, text: text });
                            }
                        }
                    }
                }

                if (typeof this.createTicks === 'function') {
                    return this.createTicks({
                        range: this.getRange(),
                        bounding: this.getBounding(),
                        defaultTicks: ticks
                    });
                }
                return ticks;
            };
        }
      `;
      if (content.includes('/* __future_anchor_unbounded_patched__ */')) {
        const idx = content.indexOf('/* __future_anchor_unbounded_patched__ */');
        content = content.slice(0, idx) + futureShims;
        modified = true;
        console.log(`Successfully updated: future anchor & fast XAxis in ${fileName}`);
      } else {
        content += futureShims;
        modified = true;
        console.log(`Successfully patched: future anchor & fast XAxis in ${fileName}`);
      }
    }

    if (modified) {
      fs.writeFileSync(kcPath, content, 'utf8');
      console.log(`Saved patches for: ${fileName}`);

      // Rename UMD files to tickerpen.js / tickerpen.min.js to eliminate library trace
      if (fileName === kcName + '.js') {
        const newPath = path.join(path.dirname(kcPath), 'tickerpen.js');
        if (fs.existsSync(newPath)) fs.unlinkSync(newPath);
        fs.renameSync(kcPath, newPath);
        console.log(`Renamed to: tickerpen.js`);
      } else if (fileName === kcName + '.min.js') {
        const newPath = path.join(path.dirname(kcPath), 'tickerpen.min.js');
        if (fs.existsSync(newPath)) fs.unlinkSync(newPath);
        fs.renameSync(kcPath, newPath);
        console.log(`Renamed to: tickerpen.min.js`);
      }
    } else {
      console.log(`No updates or already patched: ${fileName}`);
    }
  } else {
    // Check if the renamed file already exists to avoid warnings on repeat runs
    let renamedExists = false;
    if (fileName === kcName + '.js') {
      renamedExists = fs.existsSync(path.join(path.dirname(kcPath), 'tickerpen.js'));
    } else if (fileName === kcName + '.min.js') {
      renamedExists = fs.existsSync(path.join(path.dirname(kcPath), 'tickerpen.min.js'));
    }
    if (!renamedExists) {
      console.warn(`File not found: ${kcPath}`);
    }
  }
});

// Clear Vite's dependency pre-bundle cache so it picks up the patched files
const viteCacheDir = path.join(__dirname, '..', 'node_modules', '.vite');
if (fs.existsSync(viteCacheDir)) {
  fs.rmSync(viteCacheDir, { recursive: true, force: true });
  console.log('Cleared Vite dependency cache (.vite)');
}
const viteTempCacheDir = path.join(__dirname, '..', 'node_modules', '.vite-temp');
if (fs.existsSync(viteTempCacheDir)) {
  fs.rmSync(viteTempCacheDir, { recursive: true, force: true });
  console.log('Cleared Vite dependency cache (.vite-temp)');
}
