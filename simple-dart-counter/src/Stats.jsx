import React, { useMemo } from 'react';
import { Calendar, CalendarDays, CalendarCheck, BarChart3, Activity } from 'lucide-react';
import { translations } from './translations';

export default function GameStats({ records = [], lang }) {
    const t = (k) => translations[lang]?.[k] || k;
    // Výpočet statistik pomocí timestampů (record.id)
    const stats = useMemo(() => {
        const now = Date.now();
        
        // Začátky aktuálních časových úseků (půlnoc)
        const todayStart = new Date().setHours(0, 0, 0, 0);
        const startOfWeek = todayStart - (6 * 86400000); // Posledních 7 dní
        const startOfMonth = todayStart - (29 * 86400000); // Posledních 30 dní

        let today = 0;
        let week = 0;
        let month = 0;

        // Příprava dat pro graf (posledních 7 dní)
        const last7Days = Array.from({ length: 7 }).map((_, i) => {
            const d = new Date(todayStart - ((6 - i) * 86400000));
            return {
                label: `${d.getDate()}.${d.getMonth() + 1}.`,
                timestamp: d.getTime(),
                count: 0
            };
        });

        records.forEach(record => {
            const time = record.id; // id je Date.now() z uložení

            if (time >= todayStart) today++;
            if (time >= startOfWeek) week++;
            if (time >= startOfMonth) month++;

            // Zařazení do grafu
            const dayRecord = last7Days.find(d => time >= d.timestamp && time < d.timestamp + 86400000);
            if (dayRecord) {
                dayRecord.count++;
            }
        });

        // Nalezení maxima pro správné škálování výšky grafu
        const maxChartValue = Math.max(...last7Days.map(d => d.count), 1); // Minimálně 1, abychom nedělili nulou

        return { today, week, month, total: records.length, chartData: last7Days, maxChartValue };
    }, [records]);

    return (
        <div className="flex flex-col w-full max-w-4xl gap-6 p-4 mx-auto text-white">
            
            <h2 className="flex items-center gap-3 text-2xl font-black tracking-widest uppercase text-slate-300">
                <BarChart3 className="w-8 h-8 text-emerald-500" />
                {t('gameStatsTitle')}
            </h2>

            {/* KASTLÍKY - Dnes, Týden, Měsíc, Celkově */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4 landscape:grid-cols-4 landscape:gap-2 landscape:p-1">
                <div className="relative flex flex-col items-center justify-center p-4 overflow-hidden border bg-slate-900 border-slate-800 rounded-2xl">
                    <div className="absolute -right-4 -top-4 opacity-5 text-emerald-500"><Calendar className="w-24 h-24" /></div>
                    <span className="z-10 mb-1 text-xs font-bold tracking-wider uppercase sm:text-sm text-slate-400">{t('statsToday')}</span>
                    <span className="z-10 text-3xl font-black sm:text-4xl text-emerald-500">{stats.today}</span>
                </div>
                
                <div className="relative flex flex-col items-center justify-center p-4 overflow-hidden border bg-slate-900 border-slate-800 rounded-2xl">
                    <div className="absolute text-blue-500 -right-4 -top-4 opacity-5"><CalendarDays className="w-24 h-24" /></div>
                    <span className="z-10 mb-1 text-xs font-bold tracking-wider uppercase sm:text-sm text-slate-400">{t('stats7Days')}</span>
                    <span className="z-10 text-3xl font-black text-blue-500 sm:text-4xl">{stats.week}</span>
                </div>

                <div className="relative flex flex-col items-center justify-center p-4 overflow-hidden border bg-slate-900 border-slate-800 rounded-2xl">
                    <div className="absolute text-purple-500 -right-4 -top-4 opacity-5"><CalendarCheck className="w-24 h-24" /></div>
                    <span className="z-10 mb-1 text-xs font-bold tracking-wider uppercase sm:text-sm text-slate-400">{t('stats30Days')}</span>
                    <span className="z-10 text-3xl font-black text-purple-500 sm:text-4xl">{stats.month}</span>
                </div>

                <div className="relative flex flex-col items-center justify-center p-4 overflow-hidden border bg-slate-900 border-slate-800 rounded-2xl">
                    <div className="absolute -right-4 -top-4 opacity-5 text-slate-400"><Activity className="w-24 h-24" /></div>
                    <span className="z-10 mb-1 text-xs font-bold tracking-wider uppercase sm:text-sm text-slate-400">{t('statsAllTime')}</span>
                    <span className="z-10 text-3xl font-black text-white sm:text-4xl">{stats.total}</span>
                </div>
            </div>

            {/* GRAF - Aktivita za posledních 7 dní (čisté CSS/Tailwind) */}
            <div className="p-4 mt-2 border bg-slate-900 border-slate-800 rounded-2xl sm:p-6">
                <h3 className="mb-6 text-sm font-bold tracking-wider text-center uppercase text-slate-400">{t('activity7Days')}</h3>
                
                <div className="relative flex items-end justify-between h-48 gap-2 pt-6 sm:h-56 sm:gap-4">
                    {/* Horizontální linky na pozadí */}
                    <div className="absolute inset-0 flex flex-col justify-between pb-8 pointer-events-none opacity-20">
                        <div className="w-full h-0 border-b border-slate-700"></div>
                        <div className="w-full h-0 border-b border-slate-700"></div>
                        <div className="w-full h-0 border-b border-slate-700"></div>
                    </div>

                    {stats.chartData.map((day, idx) => {
                        // Výpočet výšky sloupce v procentech podle maximální hodnoty
                        const heightPercent = stats.maxChartValue > 0 ? (day.count / stats.maxChartValue) * 100 : 0;
                        const isToday = idx === 6; // Poslední položka je vždy dnešek

                        return (
                            <div key={idx} className="relative flex flex-col items-center justify-end flex-1 h-full group">
                                {/* Hodnota nad sloupcem (zobrazí se při najetí nebo je vidět pořád na mobilech) */}
                                <div className={`absolute -top-6 text-xs sm:text-sm font-bold transition-opacity ${day.count > 0 ? 'text-slate-300' : 'text-slate-600'} ${isToday ? 'text-emerald-400' : ''}`}>
                                    {day.count}
                                </div>
                                
                                {/* Samotný sloupec */}
                                <div 
                                    className={`w-full max-w-[40px] rounded-t-md transition-all duration-500 ${isToday ? 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]' : 'bg-slate-700 group-hover:bg-slate-600'}`}
                                    style={{ height: `${heightPercent}%`, minHeight: day.count > 0 ? '4px' : '0px' }}
                                ></div>
                                
                                {/* Osa X (Datum) */}
                                <div className={`h-8 mt-2 flex items-center justify-center text-[10px] sm:text-xs font-bold ${isToday ? 'text-emerald-500' : 'text-slate-500'}`}>
                                    isToday ? t('statsToday') : day.label
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

        </div>
    );
}