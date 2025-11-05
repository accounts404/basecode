import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent } from "@/components/ui/card";
import { ArrowRight } from 'lucide-react';

const KPIGrid = ({ stats }) => {
  if (!stats) return null;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {stats.map((stat, index) => (
        <Card 
          key={index} 
          className="shadow-lg border-0 bg-white hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
        >
          <CardContent className="p-6">
            <div className="flex items-start justify-between">
              <div className="flex flex-col">
                <p className="text-sm font-medium text-slate-500 mb-1">{stat.title}</p>
                <span className="text-4xl font-bold text-slate-900">{stat.value}</span>
                {stat.subtitle && <p className="text-xs text-slate-500 mt-1">{stat.subtitle}</p>}
              </div>
              <div className="p-3 bg-slate-100 rounded-lg">
                <stat.icon className="w-6 h-6" style={{ color: stat.color }} />
              </div>
            </div>
            {stat.link && (
              <Link to={stat.link} className="text-sm font-medium text-blue-600 hover:text-blue-800 flex items-center gap-1 mt-4">
                Ver detalles <ArrowRight className="w-4 h-4" />
              </Link>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
};

export default KPIGrid;