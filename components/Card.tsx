import React from 'react';

interface CardProps {
  title: string;
  value: string | number;
  badge?: string; // optional status badge e.g. "OK", "Atenção"
}

export default function Card({ title, value, badge }: CardProps) {
  return (
    <div className="rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow p-6 flex flex-col justify-between">
      <div className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</div>
      <div className="text-2xl font-semibold text-slate-900 dark:text-white mt-2">{value}</div>
      {badge && (
        <span className={`mt-2 inline-block px-2 py-0.5 text-xs font-medium rounded ${
          badge.toLowerCase().includes('ok') ? 'bg-green-100 text-green-800' :
          badge.toLowerCase().includes('atenção') ? 'bg-yellow-100 text-yellow-800' :
          'bg-red-100 text-red-800'
        }`}> {badge} </span>
      )}
    </div>
  );
}
