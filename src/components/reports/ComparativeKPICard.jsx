
import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

const formatValue = (value, format) => {
    if (value === undefined || value === null) return 'N/A';
    switch (format) {
        case 'currency':
            return `$${value.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
        case 'hours':
            return `${value.toFixed(1)}h`;
        case 'number':
            return value.toLocaleString('en-US');
        default:
            return value;
    }
};

export default function ComparativeKPICard({ title, icon: Icon, currentValue, previousValue, formatAs, color }) {
    const percentageChange = useMemo(() => {
        if (previousValue === 0 && currentValue > 0) return 100.0;
        if (previousValue === 0 && currentValue === 0) return 0;
        if (previousValue === undefined || previousValue === null || currentValue === undefined || currentValue === null) return null;
        return ((currentValue - previousValue) / previousValue) * 100;
    }, [currentValue, previousValue]);

    const TrendIcon = percentageChange > 0.1 ? TrendingUp : percentageChange < -0.1 ? TrendingDown : Minus;
    const trendColor = percentageChange > 0.1 ? 'text-green-600' : percentageChange < -0.1 ? 'text-red-600' : 'text-slate-500';
    // Constructing Tailwind classes programmatically is tricky. Let's use styles for dynamic colors or predefined sets.
    const colorStyles = {
        green: { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', icon: 'text-green-600' },
        blue: { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700', icon: 'text-blue-600' },
        purple: { bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700', icon: 'text-purple-600' },
        orange: { bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700', icon: 'text-orange-600' },
    };
    
    const styles = colorStyles[color] || colorStyles['blue'];

    return (
        <Card className={`shadow-lg border-0 ${styles.bg} ${styles.border}`}>
            <CardHeader className="pb-2">
                <CardTitle className={`text-sm font-medium ${styles.text} flex items-center gap-2`}>
                    <Icon className={`w-5 h-5 ${styles.icon}`} />
                    {title}
                </CardTitle>
            </CardHeader>
            <CardContent>
                <p className="text-3xl font-bold text-slate-900">{formatValue(currentValue, formatAs)}</p>
                <div className="flex items-center text-xs mt-1">
                    {percentageChange !== null ? (
                        <div className={`flex items-center font-semibold ${trendColor}`}>
                            <TrendIcon className="w-4 h-4 mr-1" />
                            <span>{percentageChange.toFixed(1)}%</span>
                        </div>
                    ) : (
                         <div className="flex items-center font-semibold text-slate-500">-</div>
                    )}
                    <span className="text-slate-500 ml-1">vs período anterior</span>
                </div>
            </CardContent>
        </Card>
    );
}
