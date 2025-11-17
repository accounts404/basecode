import React, { useState, useEffect, useRef } from "react";

/**
 * Componente de imagen con lazy loading y placeholder
 */
export default function LazyImage({ 
    src, 
    alt, 
    className = "", 
    placeholder = null,
    onLoad = null,
    onError = null,
    ...props 
}) {
    const [isLoaded, setIsLoaded] = useState(false);
    const [isInView, setIsInView] = useState(false);
    const [hasError, setHasError] = useState(false);
    const imgRef = useRef(null);

    useEffect(() => {
        if (!imgRef.current) return;

        // Usar Intersection Observer para lazy loading
        const observer = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        setIsInView(true);
                        observer.disconnect();
                    }
                });
            },
            {
                rootMargin: '50px', // Cargar 50px antes de que entre en vista
            }
        );

        observer.observe(imgRef.current);

        return () => {
            observer.disconnect();
        };
    }, []);

    const handleLoad = (e) => {
        setIsLoaded(true);
        if (onLoad) onLoad(e);
    };

    const handleError = (e) => {
        setHasError(true);
        if (onError) onError(e);
    };

    return (
        <div ref={imgRef} className={`relative ${className}`}>
            {/* Placeholder mientras carga */}
            {!isLoaded && !hasError && (
                <div className="absolute inset-0 bg-slate-200 animate-pulse rounded">
                    {placeholder}
                </div>
            )}

            {/* Error state */}
            {hasError && (
                <div className="absolute inset-0 bg-slate-100 flex items-center justify-center text-slate-400 rounded">
                    <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                </div>
            )}

            {/* Imagen real */}
            {isInView && (
                <img
                    src={src}
                    alt={alt}
                    className={`${className} transition-opacity duration-300 ${isLoaded ? 'opacity-100' : 'opacity-0'}`}
                    onLoad={handleLoad}
                    onError={handleError}
                    loading="lazy"
                    {...props}
                />
            )}
        </div>
    );
}