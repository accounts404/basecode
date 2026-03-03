import React, { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { MapPin, Loader2 } from 'lucide-react';
import { autocompleteAddress } from '@/functions/autocompleteAddress';

export default function AddressAutocomplete({ value, onChange, placeholder = "Buscar dirección..." }) {
    const [query, setQuery] = useState(value || '');
    const [suggestions, setSuggestions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);
    const debounceRef = useRef(null);
    const containerRef = useRef(null);

    useEffect(() => {
        setQuery(value || '');
    }, [value]);

    useEffect(() => {
        const handleClickOutside = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const search = async (text) => {
        if (text.length < 3) {
            setSuggestions([]);
            setShowDropdown(false);
            return;
        }

        setLoading(true);
        try {
            const res = await autocompleteAddress({ input: text });
            const predictions = res.data?.predictions || [];
            setSuggestions(predictions);
            setShowDropdown(predictions.length > 0);
        } catch (err) {
            setSuggestions([]);
        } finally {
            setLoading(false);
        }
    };

    const handleChange = (e) => {
        const text = e.target.value;
        setQuery(text);
        onChange(text);

        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => search(text), 400);
    };

    const handleSelect = (suggestion) => {
        const formatted = suggestion.description;
        setQuery(formatted);
        onChange(formatted);
        setSuggestions([]);
        setShowDropdown(false);
    };

    return (
        <div ref={containerRef} className="relative">
            <div className="relative">
                <Input
                    value={query}
                    onChange={handleChange}
                    onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
                    placeholder={placeholder}
                    className="pr-8"
                />
                <div className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
                </div>
            </div>

            {showDropdown && suggestions.length > 0 && (
                <ul className="absolute z-50 w-full bg-white border border-slate-200 rounded-lg shadow-lg mt-1 max-h-60 overflow-y-auto">
                    {suggestions.map((s, i) => (
                        <li
                            key={s.place_id || i}
                            className="flex items-start gap-2 px-3 py-2 cursor-pointer hover:bg-slate-50 text-sm border-b border-slate-100 last:border-0"
                            onMouseDown={() => handleSelect(s)}
                        >
                            <MapPin className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-slate-400" />
                            <span className="text-slate-700 leading-snug">{s.description}</span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}