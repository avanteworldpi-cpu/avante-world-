import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, AlertCircle, Loader2 } from 'lucide-react';
import { snapToNearestRoad } from '../lib/road-snapper';

interface MapSelectorProps {
  onLocationSelect: (lat: number, lng: number) => void;
}

export function MapSelector({ onLocationSelect }: MapSelectorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const [isSnapping, setIsSnapping] = useState(false);
  const [snappedRoadName, setSnappedRoadName] = useState<string | null>(null);
  const [lastSnappedLocation, setLastSnappedLocation] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // Zoom control moved to the top-right: it defaults to the top-left, directly
    // underneath the "Select Starting Location" card, and the card now sits above
    // Leaflet's control layer — leaving it top-left would bury the zoom buttons.
    const map = L.map(containerRef.current, { zoomControl: false }).setView([40.7128, -74.006], 13);
    L.control.zoom({ position: 'topright' }).addTo(map);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    const marker = L.marker([40.7128, -74.006], {
      icon: L.icon({
        iconUrl: 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iNDgiIHZpZXdCb3g9IjAgMCAzMiA0OCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMzIiIGhlaWdodD0iNDgiIGZpbGw9IiMzQjgyRjYiIHJ4PSI0Ii8+PGNpcmNsZSBjeD0iMTYiIGN5PSIxMiIgcj0iNiIgZmlsbD0id2hpdGUiLz48cGF0aCBkPSJNMTYgMjBDMTMuNzkgMjAgMTIgMjEuNzkgMTIgMjRDMTIgMjcuMzEgMTYgMzIgMTYgMzJDMTYgMzIgMjAgMjcuMzEgMjAgMjRDMjAgMjEuNzkgMTguMjEgMjAgMTYgMjBaIiBmaWxsPSJ3aGl0ZSIvPjwvc3ZnPg==',
        iconSize: [32, 48],
        iconAnchor: [16, 48],
        popupAnchor: [0, -48],
      }),
    })
      .addTo(map)
      .bindPopup('Starting Location');

    markerRef.current = marker;
    mapRef.current = map;

    const handleMapClick = async (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng;
      marker.setLatLng([lat, lng]);

      setIsSnapping(true);
      setSnappedRoadName(null);

      const snapped = await snapToNearestRoad(lat, lng);
      marker.setLatLng([snapped.lat, snapped.lng]);
      setLastSnappedLocation({ lat: snapped.lat, lng: snapped.lng });
      setSnappedRoadName(snapped.roadName || null);
      setIsSnapping(false);
    };

    map.on('click', handleMapClick);

    return () => {
      map.off('click', handleMapClick);
      // Tear the Leaflet instance down, not just the listener. Without this the
      // container keeps its _leaflet_id, and the next L.map() on it throws
      // "Map container is already initialized" — which StrictMode's
      // mount/cleanup/mount cycle triggers on every dev mount.
      map.remove();
      mapRef.current = null;
      markerRef.current = null;
    };
  }, []);

  const handleStart = () => {
    if (markerRef.current) {
      const latLng = markerRef.current.getLatLng();
      onLocationSelect(latLng.lat, latLng.lng);
    }
  };

  // Leaflet's own stack: panes sit at z-index 200-700 and its control containers at
  // 1000, and .leaflet-container creates no stacking context, so those compete
  // directly with these overlays. Tailwind's z-50 is literally z-index 50 -- below
  // the map pane at 400 -- so both of these rendered *underneath* the tiles. They
  // were still hit-testable, because Leaflet sets pointer-events:none on the tile
  // container, which is exactly why this reads as "in the DOM but unusable".
  return (
    <div className="w-full h-screen relative">
      <div ref={containerRef} className="w-full h-full" />

      <div className="absolute top-6 left-6 z-[1100] bg-white rounded-lg shadow-lg p-4 max-w-xs">
        <div className="flex items-start gap-3">
          <MapPin className="w-5 h-5 text-blue-600 flex-shrink-0 mt-1" />
          <div>
            <h2 className="font-semibold text-gray-900 mb-1">Select Starting Location</h2>
            <p className="text-sm text-gray-600 mb-3">Click on the map to set your starting position</p>
            {isSnapping && (
              <div className="flex items-center gap-2 text-sm text-blue-600 mt-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Snapping to nearest road...
              </div>
            )}
            {snappedRoadName && lastSnappedLocation && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <p className="text-xs text-gray-500 mb-1">Snapped to road:</p>
                <p className="text-sm font-medium text-green-600">{snappedRoadName}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      <button
        onClick={handleStart}
        disabled={isSnapping}
        className="absolute bottom-6 right-6 z-[1100] bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium shadow-lg"
      >
        {isSnapping ? 'Preparing...' : 'Start Adventure'}
      </button>
    </div>
  );
}
