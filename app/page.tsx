'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import maplibregl, { Map as MapLibreMap, GeoJSONSource, Popup } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import * as echarts from 'echarts'
import './globals.css'

type FeatureProps = Record<string, any>

const TARGETS = [
  {
    id: 'mars_jezero',
    name: 'Jezero Crater (Mars)',
    body: 'Mars',
    preview: 'Ancient crater lake/delta system; astrobiology and sedimentary context.',
    stats: ['Lat 18.38, Lon 77.58', 'Interest: delta deposits, mafic/carbonate signals, rover-scale terrain'],
    file: 'mars_jezero',
  },
  {
    id: 'moon_shackleton_rim',
    name: 'Shackleton Crater Rim (Moon)',
    body: 'Moon',
    preview: 'South-pole rim environment near persistently shadowed regions; illumination/volatile interest.',
    stats: ['Lat -89.9, Lon 0.0', 'Interest: polar thermal extremes, rough rim terrain, partial volatile proxies'],
    file: 'moon_shackleton_rim',
  },
  {
    id: 'mars_gale',
    name: 'Gale Crater (Mars)',
    body: 'Mars',
    preview: 'Curiosity rover site; diverse stratigraphy and ancient lake beds.',
    stats: ['Lat -4.58, Lon 137.44', 'Interest: sedimentary layers, clay/sulfate transitions'],
    file: 'mars_jezero', // Fallback
  },
  {
    id: 'moon_oceanus',
    name: 'Oceanus Procellarum (Moon)',
    body: 'Moon',
    preview: 'Large lunar mare; site of various landings including Apollo 12.',
    stats: ['Lat 18.4, Lon -47.4', 'Interest: volcanic history, mare basalts'],
    file: 'moon_shackleton_rim', // Fallback
  },
]

const NOT_ANALOGUABLE = [
  { id: 'gravity', title: 'Gravity', text: 'Earth 1.0 g vs Moon 0.17 g / Mars 0.38 g. Affects traction, excavation, plume-surface interaction, and physiology. Never scored.' },
  { id: 'atmosphere', title: 'Atmosphere / Vacuum', text: 'Earth ~101,325 Pa vs Moon ~0 Pa (vacuum) vs Mars ~600 Pa. Alters thermal behavior, dust, aerobraking, ECLSS. Never scored.' },
  { id: 'radiation', title: 'Radiation', text: 'Earth is shielded by magnetosphere and thick atmosphere; Moon/Mars have higher surface radiation. Never scored.' },
]

// Color-blind-safer sequential (cividis-like stops)
const DARK_SCORE_COLORS = ['#081d34', '#103967', '#18559a', '#2071cd', '#288dff', '#53a4ff', '#7ebcff', '#a9d3ff', '#d4eaff']

const Icons = {
  Terrain: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: '-2px', marginRight: 6 }}>
      <path d="m8 3 4 8 5-5 5 15H2L8 3z" />
    </svg>
  ),
  Thermal: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: '-2px', marginRight: 6 }}>
      <path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z" />
    </svg>
  ),
  Materials: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: '-2px', marginRight: 6 }}>
      <polygon points="12 2 2 7 12 12 22 7 12 2" />
      <polyline points="2 17 12 22 22 17" />
      <polyline points="2 12 12 17 22 12" />
    </svg>
  ),
  Volatiles: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: '-2px', marginRight: 6 }}>
      <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />
    </svg>
  ),
  Atmosphere: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ verticalAlign: '-2px', marginRight: 6 }}>
      <path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2" />
      <path d="M9.6 4.6A2 2 0 1 1 11 8H2" />
      <path d="M12.6 19.4A2 2 0 1 0 14 16H2" />
    </svg>
  )
}

import { DIMS, getWeightedTotal } from '../utils/scoring'

export default function Page() {
  const [targetId, setTargetId] = useState(TARGETS[0].id)
  const [data, setData] = useState<any>(null)
  const [weights, setWeights] = useState<Record<string, number>>({ terrain:1, thermal:1, materials:1, volatiles:1, aeolian:1, atmospheric:1, subsurface:1 })
  const [enabledDims, setEnabledDims] = useState<Record<string, boolean>>({ terrain:true, thermal:true, materials:true, volatiles:true, aeolian:true, atmospheric:true, subsurface:true })
  const [hideKnown, setHideKnown] = useState(true)
  const [showGibs, setShowGibs] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const mapRef = useRef<MapLibreMap | null>(null)
  const popupRef = useRef<Popup | null>(null)
  const mapDiv = useRef<HTMLDivElement | null>(null)
  const radarRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<echarts.ECharts | null>(null)

  const target = TARGETS.find(t => t.id === targetId)!

  useEffect(() => {
    let alive = true
    setSelectedId(null)
    setLoading(true)
    fetch(`/api/data/${target.file}`)
      .then(r => r.json())
      .then(j => { 
        if (alive) {
          setData(j)
          setLoading(false)
        } 
      })
      .catch(err => {
        console.error('Error fetching data:', err)
        if (alive) setLoading(false)
      })
    return () => { alive = false }
  }, [target.file])

  // compute dynamic totals
  const enriched = useMemo(() => {
    if (!data || !data.features) return null
    const features = data.features.map((f: any) => {
      const p = { ...f.properties }
      p._dynTotal = getWeightedTotal(p, weights, enabledDims)
      return { ...f, properties: p }
    })
    return { ...data, features }
  }, [data, weights, enabledDims])

  const visible = useMemo(() => {
    if (!enriched) return null
    const features = enriched.features.filter((f: any) => hideKnown ? f.properties.is_novel : true)
    return { ...enriched, features }
  }, [enriched, hideKnown])

  const selected = useMemo(() => {
    if (!visible || !selectedId) return null
    return visible.features.find((f: any) => f.properties.hex_id === selectedId)?.properties || null
  }, [visible, selectedId])

  const ranked = useMemo(() => {
    if (!visible) return []
    return [...visible.features]
      .map((f: any) => f.properties)
      .sort((a: any, b: any) => (b._dynTotal - a._dynTotal))
      .slice(0, 20)
  }, [visible])

  // update selection effect: fly to hex if selected from list
  useEffect(() => {
    if (!mapRef.current) return
    const map = mapRef.current
    if (map.getLayer('hex-selected')) {
      map.setFilter('hex-selected', ['==', ['get', 'hex_id'], selectedId || ''])
    }
    
    if (!selectedId || !visible) return
    const feat = visible.features.find((f: any) => f.properties.hex_id === selectedId)
    if (feat) {
      map.flyTo({
        center: [feat.properties.lon, feat.properties.lat],
        zoom: Math.max(map.getZoom(), 4)
      })
    }
  }, [selectedId, visible])

  // init map
  useEffect(() => {
    if (!mapDiv.current || mapRef.current) return
    const gibsTileUrl = (typeof process !== 'undefined' && process.env.VITE_NASA_GIBS_URL) ||
      'https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_ShadedRelief_Bathymetry/default/GoogleMapsCompatible_Level8/{z}/{y}/{x}.jpeg'

    const map = new maplibregl.Map({
      container: mapDiv.current,
      style: {
        version: 8,
        sources: {
          osm: { 
            type: 'raster', 
            tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'], 
            tileSize: 256, 
            attribution: 'Tiles &copy; Esri &mdash; Esri, DeLorme, NAVTEQ' 
          },
          gibs: {
            type: 'raster',
            tiles: [gibsTileUrl],
            tileSize: 256,
            attribution: 'Imagery: NASA GIBS / EOSDIS (Public Domain)'
          }
        },
        layers: [
          { id: 'osm', type: 'raster', source: 'osm' },
          { id: 'gibs', type: 'raster', source: 'gibs', layout: { visibility: 'visible' }, paint: { 'raster-opacity': 0.5 } }
        ]
      },
      center: [20, 20],
      zoom: 1.2
    })
    map.addControl(new maplibregl.NavigationControl(), 'top-right')
    mapRef.current = map
    return () => { map.remove(); mapRef.current = null }
  }, [])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const setVis = () => {
      if (map.getLayer('gibs')) map.setLayoutProperty('gibs', 'visibility', showGibs ? 'visible' : 'none')
    }
    if (map.isStyleLoaded()) setVis(); else map.once('load', setVis)
  }, [showGibs])

  // update source/layers
  useEffect(() => {
    const map = mapRef.current
    if (!map || !visible) return
    const setDataOnMap = () => {
      const src = map.getSource('hexes') as GeoJSONSource | undefined
      const ptsrc = map.getSource('points') as GeoJSONSource | undefined
      const topsrc = map.getSource('top-ranked') as GeoJSONSource | undefined

      const pointData = {
        type: 'FeatureCollection',
        features: visible.features.map((f: any) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [f.properties.lon, f.properties.lat] },
          properties: f.properties
        }))
      }

      const topRankedData = {
        type: 'FeatureCollection',
        features: ranked.slice(0, 10).map((p: any, i: number) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
          properties: { ...p, rank: i + 1 }
        }))
      }

      if (!src) {
        map.addSource('hexes', { type: 'geojson', data: visible })
        map.addSource('points', { type: 'geojson', data: pointData })
        map.addSource('top-ranked', { type: 'geojson', data: topRankedData })
        
        map.addLayer({
          id: 'hex-fill', type: 'fill', source: 'hexes',
          paint: {
            'fill-color': ['step', ['get','_dynTotal'],
              DARK_SCORE_COLORS[0], 0.11, DARK_SCORE_COLORS[1], 0.22, DARK_SCORE_COLORS[2], 0.33, DARK_SCORE_COLORS[3], 0.44, DARK_SCORE_COLORS[4], 0.55, DARK_SCORE_COLORS[5], 0.66, DARK_SCORE_COLORS[6], 0.77, DARK_SCORE_COLORS[7], 0.88, DARK_SCORE_COLORS[8]
            ],
            'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.9, 0.65]
          }
        })
        map.addLayer({ id: 'hex-line', type: 'line', source: 'hexes', paint: { 'line-color': '#ffffff', 'line-width': 0.5, 'line-opacity': 0.4 } })
        
        // High-rank markers (Google Maps style)
        map.addLayer({
          id: 'top-rank-marker',
          type: 'circle',
          source: 'top-ranked',
          paint: {
            'circle-radius': 12,
            'circle-color': '#0b6e99',
            'circle-stroke-width': 2,
            'circle-stroke-color': '#ffffff'
          }
        })

        map.addLayer({
          id: 'top-rank-label',
          type: 'symbol',
          source: 'top-ranked',
          layout: {
            'text-field': ['get', 'rank'],
            'text-size': 10,
            'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
          },
          paint: {
            'text-color': '#ffffff'
          }
        })

        // Selected highlight
        map.addLayer({
          id: 'hex-selected',
          type: 'line',
          source: 'points',
          filter: ['==', ['get', 'hex_id'], selectedId || ''],
          paint: {
            'line-color': '#f0b429',
            'line-width': 3
          }
        })

        map.on('click', 'hex-fill', (e) => {
          const p = e.features?.[0]?.properties as any
          if (p?.hex_id) {
            setSelectedId(String(p.hex_id))
            const coords = e.lngLat;
            map.flyTo({ center: coords, zoom: Math.max(map.getZoom(), 4) });
            
            if (popupRef.current) popupRef.current.remove();
            popupRef.current = new maplibregl.Popup()
                .setLngLat(coords)
                .setHTML(`
                    <div style="color: #000;">
                        <strong>${p.seed_region}</strong><br/>
                        Lat: ${Number(p.lat).toFixed(4)}, Lon: ${Number(p.lon).toFixed(4)}<br/>
                        Similarity: ${(Number(p._dynTotal || p.total_score_equal || 0) * 100).toFixed(1)}%
                    </div>
                `)
                .addTo(map);
          }
        })

        let hoveredId: string | null = null
        map.on('mousemove', 'hex-fill', (e) => {
          if (e.features!.length > 0) {
            if (hoveredId) map.setFeatureState({ source: 'hexes', id: hoveredId }, { hover: false })
            hoveredId = e.features![0].id as string
            map.setFeatureState({ source: 'hexes', id: hoveredId }, { hover: true })
            map.getCanvas().style.cursor = 'pointer'
          }
        })
        map.on('mouseleave', 'hex-fill', () => {
          if (hoveredId) map.setFeatureState({ source: 'hexes', id: hoveredId }, { hover: false })
          hoveredId = null
          map.getCanvas().style.cursor = ''
        })
      } else {
        src.setData(visible)
        if (ptsrc) ptsrc.setData(pointData)
        if (topsrc) topsrc.setData(topRankedData)
      }
      // fit bounds on target change when first loaded
      if (visible.features.length) {
        const b = new maplibregl.LngLatBounds()
        for (const f of visible.features.slice(0, 1500)) {
          const coords = f.geometry.coordinates[0]
          if (coords) {
            for (const c of coords) b.extend(c as [number,number])
          }
        }
        if (!b.isEmpty()) map.fitBounds(b, { padding: 20, maxZoom: 5, duration: 0 })
      }
    }
    if (map.isStyleLoaded()) setDataOnMap(); else map.once('load', setDataOnMap)
  }, [visible, targetId])

  // radar chart
  useEffect(() => {
    if (!radarRef.current) return
    if (!chartRef.current) chartRef.current = echarts.init(radarRef.current)
    const p = selected
    const vals = DIMS.map(d => (p && p[d.sim] != null && !Number.isNaN(Number(p[d.sim]))) ? Number(p[d.sim]) : 0)
    chartRef.current.setOption({
      title: { text: 'Similarity by dimension', left: 'center', textStyle: { fontSize: 12, color: '#ffffff' } },
      radar: { 
        indicator: DIMS.map(d => ({ name: d.label, max: 1 })), 
        radius: 70,
        axisName: { color: '#a0a0a0' },
        splitArea: { areaStyle: { color: ['#111', '#1a1a1a'] } },
        axisLine: { lineStyle: { color: '#333' } },
        splitLine: { lineStyle: { color: '#333' } }
      },
      series: [{ type: 'radar', data: [{ value: vals, name: 'Similarity', areaStyle: { color: 'rgba(51,153,255,0.35)' }, lineStyle: { color: '#3399ff' }, itemStyle: { color: '#3399ff' } }] }],
      tooltip: {}
    })
  }, [selected])

  const breakdowns: string[] = selected?.breakdown_reasons ? JSON.parse(selected.breakdown_reasons) : []
  const tags: string[] = selected?.mission_tags ? JSON.parse(selected.mission_tags) : []
  const worldview = selected ? `https://worldview.earthdata.nasa.gov/?v=${selected.lon-1},${selected.lat-1},${selected.lon+1},${selected.lat+1}&l=Reference_Labels_15m,Reference_Features_15m,Coastlines_15m,MODIS_Terra_CorrectedReflectance_TrueColor` : '#'
  const earthdata = selected ? `https://search.earthdata.nasa.gov/search?m=${selected.lat}!${selected.lon}!5!0!0!0%2C2` : '#'

  return (
    <div className="app">
      <header>
        <h1>AnalogAtlas</h1>
        <span className="sub">Multi-dimensional planetary analog search</span>
        <span className="badge badge-synth" title="This build uses synthetic/estimated fallback data">DATA BUILD</span>
      </header>
      <div className="main">
        <div className="left">
          <section className="panel" aria-label="Target picker">
            <h2>Target picker</h2>
            <div className="row">
              <label htmlFor="target">Moon/Mars target site</label>
              <select id="target" value={targetId} onChange={e => setTargetId(e.target.value)}>
                {TARGETS.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="notice">
              <div><strong>{target.name}</strong></div>
              <div className="small">{target.preview}</div>
              {target.stats.map(s => <div key={s} className="kv">• {s}</div>)}
              <div className="kv">
                <><span className="badge badge-synth">target profile</span> fallback/estimated</>
              </div>
            </div>
          </section>

          <section className="panel" aria-label="Parameters and weights">
            <h2>Parameters: include/exclude & weights</h2>
            <div className="small" style={{marginBottom:8}}>Include parameters to use in ranking, or exclude them. Excluded parameters are omitted from the live total score.</div>
            {DIMS.map(d => (
              <div key={d.key} className="row" style={{opacity: enabledDims[d.key] ? 1 : 0.6}}>
                <label htmlFor={`inc-${d.key}`}>
                  <input id={`inc-${d.key}`} type="checkbox" checked={enabledDims[d.key]}
                    onChange={e => setEnabledDims(s => ({ ...s, [d.key]: e.target.checked }))} /> Include <strong>{d.label}</strong>
                </label>
                <div className="slider-row">
                  <input id={`w-${d.key}`} type="range" min={0} max={3} step={0.25} value={weights[d.key]} disabled={!enabledDims[d.key]}
                    onChange={e => setWeights(w => ({ ...w, [d.key]: Number(e.target.value) }))} />
                  <span className="small">{enabledDims[d.key] ? weights[d.key].toFixed(2) : 'off'}</span>
                </div>
              </div>
            ))}
            <div className="row">
              <label htmlFor="novel"><input id="novel" type="checkbox" checked={hideKnown} onChange={e => setHideKnown(e.target.checked)} /> Hide known analogs (novelty mode)</label>
            </div>
            <div className="small">Total score is a user-weighted mean over <strong>included</strong> available scored parameters. Missing dimension data is never filled.</div>
          </section>

          <section className="panel" aria-label="Candidate hexes">
            <h2>Candidate hexes (top 20 shown)</h2>
            <ul className="list">
              {ranked.map((p: any, i: number) => (
                <li key={p.hex_id} aria-selected={selectedId === p.hex_id} tabIndex={0}
                  onClick={() => setSelectedId(p.hex_id)} onKeyDown={e => (e.key==='Enter'||e.key===' ') && setSelectedId(p.hex_id)}>
                  <div><strong>#{i+1}</strong> {p.seed_region} — {Number(p._dynTotal).toFixed(3)}</div>
                  <div>
                    {p.pareto_front && <span className="badge badge-pareto">Pareto</span>}
                    {p.is_novel && <span className="badge badge-novel">novel</span>}
                    {p.breaks_down && <span className="badge badge-break">breakdown</span>}
                    <span className="badge badge-synth">data</span>
                  </div>
                </li>
              ))}
            </ul>
            <div className="small">Pareto-front highlights indicate non-dominated profiles across scored dimensions (computed in preprocessing).</div>
          </section>
        </div>

        <div className="map-wrap panel" aria-label="Map">
          {loading && (
            <div className="loading-overlay">
              <div className="spinner"></div>
              <span>Loading planetary data...</span>
            </div>
          )}
          <div id="map" ref={mapDiv} role="application" aria-label="Analog score map" />
          <div style={{position:'absolute', top:8, left:8, zIndex:2, background:'rgba(17,17,17,0.9)', padding:'6px 8px', borderRadius:6, fontSize:12, border:'1px solid #333', color:'#fff'}}>
            <label htmlFor="gibs" style={{color:'#fff'}}><input id="gibs" type="checkbox" checked={showGibs} onChange={e=>setShowGibs(e.target.checked)} /> NASA GIBS imagery (verified)</label>
          </div>
        </div>

        <div className="right">
          <section className="panel" aria-label="Selected hex details" style={{ flex: '2 1 0%' }}>
            <h2>Selected hex details</h2>
            {!selected && <div className="small">Click a hex on the map or choose from the ranked list.</div>}
            {selected && (
              <div>
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom: 10}}>
                    <div>
                        <div className="kv"><strong>Region:</strong> {selected.seed_region} ({selected.profile})</div>
                        <div className="kv"><strong>Hex ID:</strong> {selected.hex_id}</div>
                        <div className="kv"><strong>Coordinates:</strong> {Number(selected.lat).toFixed(4)}, {Number(selected.lon).toFixed(4)}</div>
                    </div>
                    <div style={{textAlign:'right'}}>
                        <div className="kv"><strong>Weighted Score</strong></div>
                        <div style={{fontSize: 24, fontWeight: 'bold', color: 'var(--accent)'}}>{Number(selected._dynTotal).toFixed(3)}</div>
                    </div>
                </div>

                <table style={{ width: '100%', fontSize: '11px', borderCollapse: 'collapse', marginBottom: 15 }}>
                    <thead>
                        <tr style={{ borderBottom: '1px solid #333' }}>
                            <th style={{ textAlign: 'left', padding: '4px' }}>Parameter</th>
                            <th style={{ textAlign: 'right', padding: '4px' }}>Site</th>
                            <th style={{ textAlign: 'right', padding: '4px' }}>Analog</th>
                            <th style={{ textAlign: 'right', padding: '4px' }}>Match</th>
                        </tr>
                    </thead>
                    <tbody>
                        {DIMS.map(d => (
                            <tr key={d.key} style={{ borderBottom: '1px solid #222' }}>
                                <td style={{ padding: '4px' }}>{d.label}</td>
                                <td style={{ textAlign: 'right', padding: '4px' }}>-</td>
                                <td style={{ textAlign: 'right', padding: '4px' }}>{selected[d.sim] != null ? Number(selected[d.sim]).toFixed(2) : '-'}</td>
                                <td style={{ textAlign: 'right', padding: '4px', fontWeight: 'bold' }}>
                                    {selected[d.sim] != null ? `${(Number(selected[d.sim]) * 100).toFixed(0)}%` : '-'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <div className="small">{DIMS.filter(d => enabledDims[d.key] && selected[d.sim] != null && Number(selected[d.sim]) >= 0.5).map(d => d.label).join(', ') || 'No strong matches (>=0.5) among included parameters.'}</div>
                {DIMS.some(d => !enabledDims[d.key]) && <div className="small" style={{marginTop:4}}><strong>Excluded parameters:</strong> {DIMS.filter(d => !enabledDims[d.key]).map(d => d.label).join(', ')}</div>}
                <h3>What doesn't match / breaks down</h3>
                {breakdowns.length ? <ul className="small">{breakdowns.map((b,i)=><li key={i}>{b}</li>)}</ul> : <div className="small">No dimension below threshold; still not an exact analog.</div>}
                <h3>Mission-use tags</h3>
                <div className="tags">{tags.map(t => <span key={t} className="tag">{t}</span>)}</div>
                <h3>Data provenance</h3>
                <div className="small">Provenance: <strong>{String(selected.provenance)}</strong>; quality: {String(selected.data_quality)}.</div>
                <div className="links small" style={{marginTop:6}}>
                  <a href={worldview} target="_blank" rel="noreferrer">Open in NASA Worldview</a> · <a href={earthdata} target="_blank" rel="noreferrer">Open in Earthdata Search</a>
                </div>
              </div>
            )}
          </section>

          {data?.nasaCollections && data.nasaCollections.length > 0 && (
            <section className="panel" aria-label="Live NASA CMR Datasets">
              <h2>Live NASA CMR Datasets</h2>
              <ul className="list">
                {data.nasaCollections.map((col: any) => (
                  <li key={col.id}>
                    <div><strong>{col.short_name || col.title}</strong></div>
                    <div className="small">{col.title}</div>
                    <div className="small" style={{color: 'var(--accent)'}}>ID: {col.id}</div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  )
}
