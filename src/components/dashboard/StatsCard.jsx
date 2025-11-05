import React from 'react';
import { Card, CardContent } from "@/components/ui/card";

const StatsCard = ({ title, value, icon: Icon, color, description }) => {
  const colorClasses = {
    blue: 'text-blue-600 bg-blue-50 border-blue-200',
    green: 'text-green-600 bg-green-50 border-green-200',
    purple: 'text-purple-600 bg-purple-50 border-purple-200',
    orange: 'text-orange-600 bg-orange-50 border-orange-200',
    red: 'text-red-600 bg-red-50 border-red-200',
  };

  return (
    <Card className={`shadow-lg border-0 ${colorClasses[color] || colorClasses.blue}`}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className={`text-sm font-medium ${color === 'blue' ? 'text-blue-600' : color === 'green' ? 'text-green-600' : color === 'purple' ? 'text-purple-600' : color === 'orange' ? 'text-orange-600' : 'text-red-600'}`}>
              {title}
            </p>
            <p className={`text-3xl font-bold ${color === 'blue' ? 'text-blue-900' : color === 'green' ? 'text-green-900' : color === 'purple' ? 'text-purple-900' : color === 'orange' ? 'text-orange-900' : 'text-red-900'}`}>
              {value}
            </p>
            {description && (
              <p className={`text-sm mt-1 ${color === 'blue' ? 'text-blue-600' : color === 'green' ? 'text-green-600' : color === 'purple' ? 'text-purple-600' : color === 'orange' ? 'text-orange-600' : 'text-red-600'}`}>
                {description}
              </p>
            )}
          </div>
          <Icon className={`w-8 h-8 ${color === 'blue' ? 'text-blue-600' : color === 'green' ? 'text-green-600' : color === 'purple' ? 'text-purple-600' : color === 'orange' ? 'text-orange-600' : 'text-red-600'}`} />
        </div>
      </CardContent>
    </Card>
  );
};

export default StatsCard;