import React, { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { MapPin, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function AddressAutocomplete({ 
    value, 
    onChange, 
    placeholder = "Buscar dirección...",
    className = "" 
}) {
    const [inputValue, setInputValue] = useState(value || '');
    const [suggestions, setSuggestions] = useState([]);
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const timeoutRef = useRef(null);
    const inputRef = useRef(null);

    useEffect(() => {
        setInputValue(value || '');
    }, [value]);

    const fetchSuggestions = async (searchText) => {
        if (!searchText || searchText.trim().length < 3) {
            setSuggestions([]);
            setIsOpen(false);
            return;
        }

        setIsLoading(true);
        try {
            const response = await base44.functions.invoke('autocompleteAddress', { 
                input: searchText 
            });

            if (response.data?.predictions) {
                setSuggestions(response.data.predictions);
                setIsOpen(response.data.predictions.length > 0);
            } else {
                setSuggestions([]);
                setIsOpen(false);
            }
        } catch (error) {
            console.error('Error fetching address suggestions:', error);
            setSuggestions([]);
            setIsOpen(false);
        } finally {
            setIsLoading(false);
        }
    };

    const handleInputChange = (e) => {
        const newValue = e.target.value;
        setInputValue(newValue);
        onChange(newValue);

        // Debounce la búsqueda
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = setTimeout(() => {
            fetchSuggestions(newValue);
        }, 300);
    };

    const handleSelectSuggestion = (suggestion) => {
        setInputValue(suggestion.description);
        onChange(suggestion.description);
        setSuggestions([]);
        setIsOpen(false);
        
        if (inputRef.current) {
            inputRef.current.blur();
        }
    };

    const handleInputBlur = () => {
        setTimeout(() => {
            setIsOpen(false);
        }, 200);
    };

    const handleInputFocus = () => {
        if (suggestions.length > 0) {
            setIsOpen(true);
        }
    };

    return (
        <div className="relative w-full">
            <div className="relative">
                <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <Input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={handleInputChange}
                    onFocus={handleInputFocus}
                    onBlur={handleInputBlur}
                    placeholder={placeholder}
                    className={`pl-10 pr-10 ${className}`}
                />
                {isLoading && (
                    <Loader2 className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5 animate-spin" />
                )}
            </div>

            {/* Suggestions Dropdown */}
            {isOpen && suggestions.length > 0 && (
                <Card className="absolute top-full left-0 right-0 mt-1 max-h-80 overflow-y-auto z-50 shadow-xl border-2">
                    <CardContent className="p-0">
                        {suggestions.map((suggestion, index) => (
                            <div
                                key={index}
                                className="p-3 hover:bg-blue-50 cursor-pointer border-b last:border-b-0 transition-colors"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={() => handleSelectSuggestion(suggestion)}
                            >
                                <div className="flex items-start gap-2">
                                    <MapPin className="w-4 h-4 text-blue-600 mt-1 flex-shrink-0" />
                                    <div className="flex-1">
                                        <p className="text-sm text-gray-900">{suggestion.description}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}