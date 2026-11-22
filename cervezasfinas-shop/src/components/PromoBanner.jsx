import React, { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { api, API_URL } from '../lib/api';

const getSmartImageUrl = (path) => {
    if (!path) return null;
    if (path.startsWith('http')) return path;

    // Clean path: remove ../, ./, and leading /
    let cleanPath = path.replace(/(\.\.\/|\.\/)/g, '');
    if (cleanPath.startsWith('/')) cleanPath = cleanPath.substring(1);

    // Common banner locations to try if just a filename is provided (heuristic)
    // But mostly we assume the DB path is relative to root or is a filename in assets/banners
    // Let's assume the DB path is somewhat accurate but needs cleaning.
    // If it looks like just a filename (no slashes), maybe prepend standard banner dir?
    if (!cleanPath.includes('/')) {
        // cleanPath = `assets/banners/${cleanPath}`; // Optional heuristic, maybe risky
    }

    return `https://cervezasfinas.com/${cleanPath}`;
};

export default function PromoBanner() {
    const [banners, setBanners] = useState([]);
    const [loading, setLoading] = useState(true);
    const [currentSlide, setCurrentSlide] = useState(0);
    const [isPaused, setIsPaused] = useState(false);

    useEffect(() => {
        loadBanners();
    }, []);

    const loadBanners = async () => {
        try {
            const res = await api.get('/frontend/banners.php');
            if (res.success && res.data && res.data.length > 0) {
                setBanners(res.data);
            }
        } catch (error) {
            console.error("Failed to load banners", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isPaused || banners.length <= 1) return;

        const interval = setInterval(() => {
            setCurrentSlide((prev) => (prev + 1) % banners.length);
        }, 5000);

        return () => clearInterval(interval);
    }, [isPaused, banners.length]);

    const goToSlide = (index) => setCurrentSlide(index);
    const nextSlide = () => setCurrentSlide((prev) => (prev + 1) % banners.length);
    const prevSlide = () => setCurrentSlide((prev) => (prev - 1 + banners.length) % banners.length);

    if (loading) return <div className="w-full h-64 bg-gray-200 animate-pulse rounded-3xl" />;
    if (banners.length === 0) return null;

    const currentBanner = banners[currentSlide];

    // Ensure colors are valid classes or fallback
    const gradientClass = (currentBanner.color_from && currentBanner.color_to)
        ? `from-${currentBanner.color_from.replace('from-', '')} to-${currentBanner.color_to.replace('to-', '')}`
        : 'from-green-600 to-green-800';

    const bgStyle = currentBanner.image_url ? {
        backgroundImage: `url(${getSmartImageUrl(currentBanner.image_url)})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center'
    } : {};

    return (
        <div
            className="relative w-full rounded-3xl overflow-hidden shadow-2xl bg-gray-900"
            onMouseEnter={() => setIsPaused(true)}
            onMouseLeave={() => setIsPaused(false)}
        >
            {/* Banner Content */}
            {currentBanner.image_url ? (
                <div
                    className={`relative w-full h-[180px] sm:h-[250px] md:h-[300px] bg-gradient-to-r ${currentBanner.color_from || 'from-green-600'} ${currentBanner.color_to || 'to-green-800'}`}
                >
                    <img
                        src={getSmartImageUrl(currentBanner.image_url)}
                        alt={currentBanner.title}
                        className="w-full h-full object-cover"
                    />
                </div>
            ) : (
                <div
                    className={`relative px-8 py-16 md:py-20 transition-all duration-500 bg-gradient-to-r ${currentBanner.color_from || 'from-green-600'} ${currentBanner.color_to || 'to-green-800'} h-[180px] sm:h-[250px] md:h-[300px] flex items-center justify-center`}
                >
                    <div className="relative z-10 max-w-4xl mx-auto text-center">
                        <h2 className="text-3xl md:text-5xl font-black text-white mb-4 animate-fade-in drop-shadow-md">
                            {currentBanner.title}
                        </h2>
                        <p className="text-lg md:text-2xl text-white font-semibold opacity-90 animate-fade-in drop-shadow-sm">
                            {currentBanner.subtitle}
                        </p>
                    </div>
                </div>
            )}

            {/* Navigation Arrows (Only if multiple) */}
            {banners.length > 1 && (
                <>
                    <button
                        onClick={prevSlide}
                        className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/30 hover:bg-white/50 backdrop-blur-sm text-white p-3 rounded-full transition-all transform hover:scale-110"
                    >
                        <ChevronLeft className="w-6 h-6" />
                    </button>

                    <button
                        onClick={nextSlide}
                        className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/30 hover:bg-white/50 backdrop-blur-sm text-white p-3 rounded-full transition-all transform hover:scale-110"
                    >
                        <ChevronRight className="w-6 h-6" />
                    </button>

                    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
                        {banners.map((_, index) => (
                            <button
                                key={index}
                                onClick={() => goToSlide(index)}
                                className={`w-3 h-3 rounded-full transition-all ${index === currentSlide
                                    ? 'bg-white w-8'
                                    : 'bg-white/50 hover:bg-white/75'
                                    }`}
                            />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
