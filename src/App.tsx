/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef } from 'react';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';
import { toPng } from 'html-to-image';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  Legend,
  ScatterChart,
  Scatter,
  ZAxis,
  ReferenceLine,
  LabelList
} from 'recharts';
import { 
  Plus, 
  Trash2, 
  TrendingUp, 
  Lightbulb, 
  Zap, 
  Calculator, 
  FileText,
  Info,
  Settings,
  Table as TableIcon,
  BarChart3,
  RotateCcw,
  ChevronRight,
  ChevronLeft,
  Play,
  BookOpen,
  Beaker,
  ArrowRight,
  Users,
  ClipboardList,
  GraduationCap,
  Eraser,
  Undo2,
  Redo2,
  MousePointer2,
  Dot,
  Pencil,
  Spline
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface DataPoint {
  id: string;
  current?: number; // in mA
  voltage?: number; // in V
  resistance?: number; // in Ohms (manual input)
  temperature?: number; // in °C (manual input for lamp)
}

const DEFAULT_ALPHA = 0.0045; 
const DEFAULT_TRT = 25; 

type AppStep = 'capa' | 'identificacao' | 'roteiro' | 'dashboard';
type TabType = 'lampada' | 'led_vermelho' | 'led_verde';

export default function App() {
  const [currentStep, setCurrentStep] = useState<AppStep>('capa');
  const [activeTab, setActiveTab] = useState<TabType>('lampada');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  // Group Info State
  const [turma, setTurma] = useState('');
  const [professor, setProfessor] = useState('');
  const [componentes, setComponentes] = useState(['']);

  // State for Lamp (Experimento 1)
  const [lampData, setLampData] = useState<DataPoint[]>([]);
  const [lampRT, setLampRT] = useState<number | undefined>(undefined); 
  const [alpha, setAlpha] = useState<number>(DEFAULT_ALPHA);
  const [tempAmb, setTempAmb] = useState<number>(DEFAULT_TRT);
  const [tempIni, setTempIni] = useState<number>(DEFAULT_TRT);
  const [lampLines, setLampLines] = useState<{ points: { x: number, y: number }[], color: string }[]>([]);
  const [lampHistory, setLampHistory] = useState<{ points: { x: number, y: number }[], color: string }[][]>([]);
  const [maxResistance, setMaxResistance] = useState<number | undefined>(undefined);
  const [maxTemperature, setMaxTemperature] = useState<number | undefined>(undefined);

  // State for LED Verde
  const [ledVerdeData, setLedVerdeData] = useState<DataPoint[]>([]);
  const [ledVerdeLines, setLedVerdeLines] = useState<{ points: { x: number, y: number }[], color: string }[]>([]);
  const [ledVerdeHistory, setLedVerdeHistory] = useState<{ points: { x: number, y: number }[], color: string }[][]>([]);

  // State for LED Vermelho
  const [ledVermelhoData, setLedVermelhoData] = useState<DataPoint[]>([]);
  const [ledVermelhoLines, setLedVermelhoLines] = useState<{ points: { x: number, y: number }[], color: string }[]>([]);
  const [ledVermelhoHistory, setLedVermelhoHistory] = useState<{ points: { x: number, y: number }[], color: string }[][]>([]);
  const [lampRedoHistory, setLampRedoHistory] = useState<{ points: { x: number, y: number }[], color: string }[][]>([]);
  const [ledVerdeRedoHistory, setLedVerdeRedoHistory] = useState<{ points: { x: number, y: number }[], color: string }[][]>([]);
  const [ledVermelhoRedoHistory, setLedVermelhoRedoHistory] = useState<{ points: { x: number, y: number }[], color: string }[][]>([]);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Dynamic Scales Calculation
  const chartScales = useMemo(() => {
    const calcScale = (val: number, def: number, divisions: number, hasData: boolean) => {
      if (!hasData) {
        return { max: def, ticks: [], minorTicks: [] };
      }
      const currentMax = Math.max(val, def);
      const s = currentMax / divisions;
      const exponent = Math.floor(Math.log10(s || 1));
      const fraction = s / Math.pow(10, exponent);
      let niceFraction;
      if (fraction <= 1) niceFraction = 1;
      else if (fraction <= 2) niceFraction = 2;
      else if (fraction <= 2.5) niceFraction = 2.5;
      else if (fraction <= 5) niceFraction = 5;
      else niceFraction = 10;
      
      const majorStep = niceFraction * Math.pow(10, exponent);
      const niceMax = majorStep * divisions;
      
      const ticks = [];
      for (let i = 0; i <= divisions; i++) {
        ticks.push(Number((i * majorStep).toFixed(4)));
      }
      
      const minorTicks = [];
      const minorStep = majorStep / 5;
      for (let i = 0; i <= divisions * 5; i++) {
        minorTicks.push(Number((i * minorStep).toFixed(4)));
      }
      
      return { max: niceMax, ticks, minorTicks };
    };

    const getMax = (data: DataPoint[], lines: { points: { x: number, y: number }[] }[], axis: 'x' | 'y') => {
      const dataMax = Math.max(...data.map(d => (axis === 'x' ? d.voltage : d.current) || 0), 0);
      const linesMax = Math.max(...lines.flatMap(l => l.points.map(p => (axis === 'x' ? p.x : p.y))), 0);
      return Math.max(dataMax, linesMax);
    };

    const hasAnyData = (data: DataPoint[], lines: any[]) => {
      return data.some(d => d.voltage !== undefined || d.current !== undefined) || lines.length > 0;
    };

    const lampX = calcScale(getMax(lampData, lampLines, 'x'), 0.1, 6, hasAnyData(lampData, lampLines));
    const lampY = calcScale(getMax(lampData, lampLines, 'y'), 10, 7, hasAnyData(lampData, lampLines));
    
    const ledRedX = calcScale(getMax(ledVermelhoData, ledVermelhoLines, 'x'), 0.1, 6, hasAnyData(ledVermelhoData, ledVermelhoLines));
    const ledRedY = calcScale(getMax(ledVermelhoData, ledVermelhoLines, 'y'), 1, 4, hasAnyData(ledVermelhoData, ledVermelhoLines));
    
    const ledGreenX = calcScale(getMax(ledVerdeData, ledVerdeLines, 'x'), 0.1, 6, hasAnyData(ledVerdeData, ledVerdeLines));
    const ledGreenY = calcScale(getMax(ledVerdeData, ledVerdeLines, 'y'), 1, 4, hasAnyData(ledVerdeData, ledVerdeLines));

    return {
      lampada: { x: lampX, y: lampY },
      led_vermelho: { x: ledRedX, y: ledRedY },
      led_verde: { x: ledGreenX, y: ledGreenY }
    };
  }, [lampData, ledVermelhoData, ledVerdeData, lampLines, ledVermelhoLines, ledVerdeLines]);

  // Analysis text
  const [analysisText, setAnalysisText] = useState('');
  const [ledUnifiedQuestions, setLedUnifiedQuestions] = useState({ q1: '', q2: '' });
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  
  const reportRef = useRef<HTMLDivElement>(null);
  const lampChartRef = useRef<HTMLDivElement>(null);
  const ledVermelhoChartRef = useRef<HTMLDivElement>(null);
  const ledVerdeChartRef = useRef<HTMLDivElement>(null);

  const [lampChartImg, setLampChartImg] = useState<string | null>(null);
  const [ledVermelhoChartImg, setLedVermelhoChartImg] = useState<string | null>(null);
  const [ledVerdeChartImg, setLedVerdeChartImg] = useState<string | null>(null);

  // Manual Plotting State (Active)
  const [activeTool, setActiveTool] = useState<'point' | 'line' | 'eraser'>('point');
  const [selectedColor, setSelectedColor] = useState('#2563eb');
  const [isDrawing, setIsDrawing] = useState(false);

  // Helper to get current tab state
  const currentData = activeTab === 'lampada' ? lampData : (activeTab === 'led_verde' ? ledVerdeData : ledVermelhoData);
  const setCurrentData = activeTab === 'lampada' ? setLampData : (activeTab === 'led_verde' ? setLedVerdeData : setLedVermelhoData);
  const drawnLines = activeTab === 'lampada' ? lampLines : (activeTab === 'led_verde' ? ledVerdeLines : ledVermelhoLines);
  const setDrawnLines = activeTab === 'lampada' ? setLampLines : (activeTab === 'led_verde' ? setLedVerdeLines : setLedVermelhoLines);
  const manualHistory = activeTab === 'lampada' ? lampHistory : (activeTab === 'led_verde' ? ledVerdeHistory : ledVermelhoHistory);
  const setManualHistory = activeTab === 'lampada' ? setLampHistory : (activeTab === 'led_verde' ? setLedVerdeHistory : setLedVermelhoHistory);
  const redoHistory = activeTab === 'lampada' ? lampRedoHistory : (activeTab === 'led_verde' ? ledVerdeRedoHistory : ledVermelhoRedoHistory);
  const setRedoHistory = activeTab === 'lampada' ? setLampRedoHistory : (activeTab === 'led_verde' ? setLedVerdeRedoHistory : setLedVermelhoRedoHistory);

  const getPointFromEvent = (e: React.MouseEvent | React.TouchEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    // Adjusted paddings to match Recharts margins exactly
    const paddingLeft = 80; 
    const paddingRight = 40;
    const paddingTop = 40;
    const paddingBottom = 80;
    
    const width = rect.width - paddingLeft - paddingRight;
    const height = rect.height - paddingTop - paddingBottom;
    
    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const currentScale = chartScales[activeTab === 'lampada' ? 'lampada' : (activeTab === 'led_vermelho' ? 'led_vermelho' : 'led_verde')];
    const maxX = currentScale.x.max;
    const maxY = currentScale.y.max;
    
    const xRaw = ((clientX - rect.left - paddingLeft) / width) * maxX;
    const yRaw = maxY - ((clientY - rect.top - paddingTop) / height) * maxY;
    
    if (xRaw >= 0 && xRaw <= maxX && yRaw >= 0 && yRaw <= maxY) {
      return { x: parseFloat(xRaw.toFixed(3)), y: parseFloat(yRaw.toFixed(2)) };
    }
    return null;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    const point = getPointFromEvent(e);
    if (!point) return;

    if (activeTool === 'point') {
      setManualHistory(prev => [...prev, drawnLines]);
      setRedoHistory([]); 
      setDrawnLines(prev => [...prev, { points: [point], color: selectedColor }]);
    } else if (activeTool === 'line') {
      setIsDrawing(true);
      setManualHistory(prev => [...prev, drawnLines]);
      setRedoHistory([]);
      setDrawnLines(prev => [...prev, { points: [point], color: selectedColor }]);
    } else if (activeTool === 'eraser') {
      setManualHistory(prev => [...prev, drawnLines]);
      setRedoHistory([]);
      setDrawnLines(prev => prev.filter(line => 
        !line.points.some(p => Math.hypot(p.x - point.x, (p.y - point.y)/20) < 0.8)
      ));
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const point = getPointFromEvent(e);

    if (isDrawing && activeTool === 'line') {
      if (point) {
        setDrawnLines(prev => {
          if (prev.length === 0) return prev;
          const newLines = [...prev];
          const lastLine = newLines[newLines.length - 1];
          newLines[newLines.length - 1] = {
            ...lastLine,
            points: [...lastLine.points, point]
          };
          return newLines;
        });
      }
    }
  };

  const handleMouseUp = () => {
    setIsDrawing(false);
  };

  const undoManualAction = () => {
    if (manualHistory.length > 0) {
      const prev = manualHistory[manualHistory.length - 1];
      setRedoHistory(curr => [...curr, drawnLines]);
      setDrawnLines(prev);
      setManualHistory(manualHistory.slice(0, -1));
    }
  };

  const redoManualAction = () => {
    if (redoHistory.length > 0) {
      const next = redoHistory[redoHistory.length - 1];
      setManualHistory(curr => [...curr, drawnLines]);
      setDrawnLines(next);
      setRedoHistory(redoHistory.slice(0, -1));
    }
  };

  const clearManualPoints = () => {
    setManualHistory(prev => [...prev, drawnLines]);
    setRedoHistory([]);
    setDrawnLines([]);
    // Also clear experimental data if user wants to clear the "graph"
    setCurrentData([]);
  };

  const generatePDF = async () => {
    if (lampData.length === 0 && ledVermelhoData.length === 0 && ledVerdeData.length === 0) {
      console.warn("Nenhum dado inserido para o relatório.");
    }

    setIsGeneratingPDF(true);
    console.log("Iniciando geração do PDF...");
    
    try {
      // 1. Capture the visible charts from the UI first using toPng
      const captureChart = async (ref: React.RefObject<HTMLDivElement>, name: string) => {
        if (!ref.current) {
          console.warn(`Ref para ${name} não encontrada.`);
          return null;
        }
        try {
          console.log(`Capturando gráfico: ${name}`);
          const el = ref.current;
          const originalStyle = el.style.cssText;
          
          // Ensure element is visible for capture
          el.style.position = 'fixed';
          el.style.left = '0';
          el.style.top = '0';
          el.style.zIndex = '9999';
          el.style.visibility = 'visible';
          el.style.opacity = '1';
          el.style.display = 'block';
          el.style.backgroundColor = '#ffffff';

          // Wait for Recharts to stabilize
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          const dataUrl = await toPng(el, {
            width: 1200,
            height: 900,
            pixelRatio: 2,
            backgroundColor: '#ffffff',
            cacheBust: true,
          });

          el.style.cssText = originalStyle;
          console.log(`Gráfico ${name} capturado com sucesso.`);
          return dataUrl;
        } catch (err) {
          console.error(`Erro ao capturar gráfico ${name}:`, err);
          return null;
        }
      };

      const lImg = await captureChart(lampChartRef, "Lâmpada");
      const rvImg = await captureChart(ledVermelhoChartRef, "LED Vermelho");
      const gImg = await captureChart(ledVerdeChartRef, "LED Verde");

      setLampChartImg(lImg);
      setLedVermelhoChartImg(rvImg);
      setLedVerdeChartImg(gImg);

      // 2. Wait for the report to update with the new images
      await new Promise(resolve => setTimeout(resolve, 1000));

      if (!reportRef.current) {
        console.error("Referência do relatório não encontrada.");
        setIsGeneratingPDF(false);
        return;
      }

      const element = reportRef.current;
      console.log("Capturando relatório completo com html2canvas...");
      
      // Temporary style for capture
      const originalDisplay = element.style.display;
      const originalPosition = element.style.position;
      const originalLeft = element.style.left;
      const originalVisibility = element.style.visibility;
      const originalOpacity = element.style.opacity;

      element.style.display = 'flex';
      element.style.position = 'relative';
      element.style.left = '0';
      element.style.visibility = 'visible';
      element.style.opacity = '1';

      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff',
        logging: true,
        onclone: (clonedDoc) => {
          const clonedElement = clonedDoc.getElementById('report-container');
          if (clonedElement) {
            clonedElement.style.display = 'flex';
            clonedElement.style.visibility = 'visible';
            clonedElement.style.opacity = '1';
            clonedElement.style.position = 'relative';
            clonedElement.style.left = '0';
          }

          // Aggressive oklch replacement safety net in stylesheets
          const styleTags = clonedDoc.getElementsByTagName('style');
          for (let i = 0; i < styleTags.length; i++) {
            styleTags[i].innerHTML = styleTags[i].innerHTML.replace(/oklch\([^)]+\)/g, '#cccccc');
          }

          const allElements = clonedDoc.getElementsByTagName('*');
          for (let i = 0; i < allElements.length; i++) {
            const el = allElements[i] as HTMLElement;
            
            // Check inline styles
            const style = el.getAttribute('style');
            if (style && style.includes('oklch')) {
              el.setAttribute('style', style.replace(/oklch\([^)]+\)/g, '#cccccc'));
            }
            
            // Check computed styles for common properties
            const computedStyle = window.getComputedStyle(el);
            ['color', 'backgroundColor', 'borderColor', 'stroke', 'fill'].forEach(prop => {
              const val = (el.style as any)[prop] || computedStyle.getPropertyValue(prop);
              if (val && val.includes('oklch')) {
                (el.style as any)[prop] = '#cccccc';
              }
            });
          }
        }
      });

      // Restore styles
      element.style.display = originalDisplay;
      element.style.position = originalPosition;
      element.style.left = originalLeft;
      element.style.visibility = originalVisibility;
      element.style.opacity = originalOpacity;

      console.log("Canvas gerado, criando PDF...");
      const imgData = canvas.toDataURL('image/jpeg', 0.9);
      const pdf = new jsPDF('p', 'mm', 'a4');
      
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;
      const pageHeightInCanvas = (canvasWidth * pdfHeight) / pdfWidth;
      const totalPages = Math.ceil(canvasHeight / pageHeightInCanvas);

      for (let i = 0; i < totalPages; i++) {
        if (i > 0) pdf.addPage();
        pdf.addImage(
          imgData, 
          'JPEG', 
          0, 
          -(i * pdfHeight), 
          pdfWidth, 
          (canvasHeight * pdfWidth) / canvasWidth, 
          undefined, 
          'FAST'
        );
      }

      pdf.save(`Relatorio_Fisica_${turma || 'UFRN'}.pdf`);
      console.log("PDF salvo com sucesso.");
    } catch (error) {
      console.error("Erro fatal na geração do PDF:", error);
      alert("Ocorreu um erro ao gerar o PDF. Por favor, tente novamente.");
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  // Handlers for Data
  const addDataRow = () => {
    setCurrentData([...currentData, { id: Math.random().toString(36).substr(2, 9) }]);
  };

  const updateDataRow = (id: string, field: keyof DataPoint, value: number | undefined) => {
    setCurrentData(currentData.map(row => row.id === id ? { ...row, [field]: value } : row));
  };

  const removeDataRow = (id: string) => {
    setCurrentData(currentData.filter(row => row.id !== id));
  };

  const clearCurrentData = () => {
    setCurrentData([]);
  };

  const resetAll = () => {
    setLampData([]);
    setLedVerdeData([]);
    setLedVermelhoData([]);
    setLampLines([]);
    setLedVerdeLines([]);
    setLedVermelhoLines([]);
    setLampHistory([]);
    setLedVerdeHistory([]);
    setLedVermelhoHistory([]);
    setLampRedoHistory([]);
    setLedVerdeRedoHistory([]);
    setLedVermelhoRedoHistory([]);
    setTurma('');
    setProfessor('');
    setComponentes(['']);
    setAnalysisText('');
    setLedUnifiedQuestions({ q1: '', q2: '' });
    setCurrentStep('capa');
    setShowResetConfirm(false);
  };

  // Handlers for Group Info
  const addComponente = () => setComponentes([...componentes, '']);
  const updateComponente = (index: number, value: string) => {
    const newComp = [...componentes];
    newComp[index] = value;
    setComponentes(newComp);
  };
  const removeComponente = (index: number) => {
    if (componentes.length > 1) {
      setComponentes(componentes.filter((_, i) => i !== index));
    }
  };

  if (currentStep === 'capa') {
    return (
      <div className="min-h-screen bg-white text-slate-900 font-sans flex flex-col items-center justify-center p-8 md:p-16 relative overflow-hidden print:hidden">
        {/* Background Accents */}
        <div className="absolute top-0 left-0 w-full h-1.5 bg-blue-600" />
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-blue-50 rounded-full blur-3xl opacity-40" />
        <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-slate-50 rounded-full blur-3xl opacity-40" />

        <div className="max-w-4xl w-full space-y-16 relative z-10">
          {/* Institution Header */}
          <header className="text-center space-y-3">
            <h2 className="text-xs md:text-sm font-bold text-slate-900 tracking-[0.3em] uppercase leading-relaxed">
              Universidade Federal do Rio Grande do Norte
            </h2>
            <h3 className="text-[10px] md:text-xs font-bold text-slate-600 tracking-[0.2em] uppercase">
              Centro de Ciências Exatas e da Terra
            </h3>
            <div className="w-12 h-px bg-slate-200 mx-auto" />
            <h4 className="text-[10px] md:text-xs font-semibold text-slate-400 tracking-[0.2em] uppercase">
              Departamento de Física Teórica e Experimental
            </h4>
          </header>

          {/* Circuit Schematic Figure */}
          <div className="flex justify-center">
            <div className="relative group">
              <div className="absolute inset-0 bg-blue-400 blur-3xl opacity-20 group-hover:opacity-30 transition-opacity animate-pulse" />
              <div className="relative w-20 h-20 md:w-24 md:h-24 bg-blue-600 rounded-[2rem] flex items-center justify-center text-white shadow-2xl shadow-blue-500/20 hover:scale-105 transition-transform duration-500">
                <Zap size={40} className="md:size-[48px]" />
              </div>
            </div>
          </div>

          {/* Experiment Title */}
          <div className="text-center space-y-6 py-12 border-y border-slate-50">
            <div className="space-y-2">
              <span className="text-blue-600 font-bold tracking-[0.25em] uppercase text-[10px] md:text-xs">
                Experimento IV
              </span>
              <h1 className="text-4xl md:text-7xl font-black text-slate-900 leading-[1.1] tracking-tight">
                Elementos<br />
                não-Ôhmicos
              </h1>
            </div>
            <p className="text-slate-500 max-w-xl mx-auto text-base md:text-lg font-medium leading-relaxed">
              Estudo das curvas características de corrente vs voltagem para componentes semicondutores e resistores térmicos.
            </p>
          </div>

          <div className="flex justify-center pt-4">
            <button 
              onClick={() => setCurrentStep('identificacao')}
              className="group flex items-center gap-4 px-12 py-5 bg-blue-600 text-white rounded-2xl font-bold text-lg md:text-xl shadow-2xl shadow-blue-500/20 hover:bg-blue-700 hover:shadow-blue-500/40 hover:-translate-y-1 transition-all active:scale-95"
            >
              Iniciar Roteiro
              <ArrowRight className="group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (currentStep === 'identificacao') {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 font-sans flex flex-col items-center justify-center p-6 print:hidden">
        <div className="max-w-2xl w-full bg-white rounded-3xl shadow-2xl shadow-slate-200 p-8 md:p-12 space-y-8 relative">
          <button 
            onClick={() => setCurrentStep('capa')}
            className="absolute left-8 top-8 text-slate-400 hover:text-blue-600 transition-colors"
          >
            <ChevronLeft size={24} />
          </button>

          <div className="text-center space-y-2">
            <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Users size={32} />
            </div>
            <h2 className="text-2xl font-bold text-slate-800">Identificação do Grupo</h2>
            <p className="text-slate-500 text-sm">Preencha os dados da turma e dos integrantes.</p>
          </div>

          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest px-1">Turma</label>
                <input 
                  type="text" 
                  value={turma}
                  onChange={(e) => setTurma(e.target.value)}
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all font-medium"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest px-1">Professor(a)</label>
                <input 
                  type="text" 
                  value={professor}
                  onChange={(e) => setProfessor(e.target.value)}
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all font-medium"
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between px-1">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest">Componentes do Grupo</label>
                <button 
                  onClick={addComponente}
                  className="text-blue-600 hover:text-blue-700 font-bold text-xs flex items-center gap-1"
                >
                  <Plus size={14} /> Adicionar
                </button>
              </div>
              <div className="space-y-3">
                {componentes.map((comp, idx) => (
                  <div key={idx} className="flex gap-2">
                    <input 
                      type="text" 
                      value={comp}
                      onChange={(e) => updateComponente(idx, e.target.value)}
                      className="flex-1 px-5 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all text-sm font-medium"
                    />
                    {componentes.length > 1 && (
                      <button 
                        onClick={() => removeComponente(idx)}
                        className="p-3 text-slate-300 hover:text-red-500 transition-colors"
                      >
                        <Trash2 size={18} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <button 
            onClick={() => setCurrentStep('roteiro')}
            className="w-full py-5 bg-blue-600 text-white rounded-2xl font-bold text-lg shadow-xl shadow-blue-100 hover:bg-blue-700 transition-all flex items-center justify-center gap-2"
          >
            Prosseguir para o Roteiro
            <ArrowRight size={20} />
          </button>
        </div>
      </div>
    );
  }

  if (currentStep === 'roteiro') {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-6 md:p-12 print:hidden">
        <div className="max-w-4xl mx-auto space-y-8">
          <div className="flex items-center justify-between bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setCurrentStep('identificacao')}
                className="p-2 text-slate-400 hover:text-blue-600 transition-colors"
              >
                <ChevronLeft size={24} />
              </button>
              <div>
                <h2 className="font-bold text-slate-800">Roteiro Experimental</h2>
              </div>
            </div>
            <button 
              onClick={() => setCurrentStep('dashboard')}
              className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-blue-100 hover:bg-blue-700 transition-all flex items-center gap-2"
            >
              Ir para o Experimento
              <Play size={16} />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="space-y-8">
              <section className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-center gap-2 text-blue-600">
                  <BookOpen size={20} />
                  <h3 className="font-bold uppercase text-xs tracking-widest">Objetivos</h3>
                </div>
                <ul className="text-sm text-slate-600 space-y-3 list-disc pl-4 leading-relaxed">
                  <li>Levantar as curvas características I vs V para componentes não-ôhmicos.</li>
                  <li>Identificar a resistência a frio e a variação térmica em filamentos.</li>
                  <li>Determinar a tensão de limiar em LEDs de diferentes cores.</li>
                  <li>Analisar o comportamento da resistência dinâmica do LED.</li>
                </ul>
              </section>

              <section className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-4">
                <div className="flex items-center gap-2 text-blue-600">
                  <Beaker size={20} />
                  <h3 className="font-bold uppercase text-xs tracking-widest">Materiais</h3>
                </div>
                <ul className="text-sm text-slate-600 space-y-3 list-disc pl-4 leading-relaxed">
                  <li>Fonte DC variável (0-12V).</li>
                  <li>Multímetros Digitais.</li>
                  <li>Resistor de 27 Ω.</li>
                  <li>Lâmpada e LEDs (Verde e Vermelho).</li>
                </ul>
              </section>
            </div>

            <div className="md:col-span-2 space-y-8">
              <section className="bg-white p-8 rounded-3xl border border-slate-200 shadow-sm space-y-6">
                <div className="flex items-center gap-2 text-blue-600">
                  <GraduationCap size={20} />
                  <h3 className="font-bold uppercase text-xs tracking-widest">Fundamentação Teórica</h3>
                </div>
                <div className="text-sm text-slate-600 space-y-6 leading-relaxed">
                  <div className="space-y-3">
                    <h4 className="font-bold text-slate-800">Lei de Ohm e Condutores</h4>
                    <p>
                      A Lei de Ohm estabelece que, para condutores ôhmicos, a diferença de potencial (V) é diretamente proporcional à corrente elétrica (I), sendo a resistência (R) constante. Contudo, em <strong>elementos não-ôhmicos</strong>, essa proporcionalidade não se mantém, e a resistência varia com as condições de operação.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <h4 className="font-bold text-slate-800">Lâmpada de Incandescência</h4>
                    <p>
                      O filamento de tungstênio de uma lâmpada aquece devido ao efeito Joule. Esse aumento de temperatura provoca um aumento na agitação térmica dos átomos, dificultando a passagem dos elétrons e, consequentemente, aumentando a resistência elétrica.
                    </p>
                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100 font-mono text-center space-y-2">
                      <p className="text-blue-600 font-bold text-lg">R(T) = R₀ [1 + α(T - T₀)]</p>
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider">Variação da resistência com a temperatura</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h4 className="font-bold text-slate-800">Diodo Emissor de Luz (LED)</h4>
                    <p>
                      O LED é um dispositivo semicondutor (junção p-n). Diferente dos resistores, ele permite a passagem de corrente significativa apenas após atingir uma <strong>tensão de limiar (Vᵧ)</strong>. Acima dessa tensão, a corrente cresce exponencialmente, caracterizando um comportamento fortemente não-ôhmico.
                    </p>
                    <p>
                      A tensão de limiar está relacionada à energia do gap (bandgap) do material semicondutor, que por sua vez define a cor da luz emitida.
                    </p>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans print:bg-white print:text-black">
      {/* Top Header - Fluid and integrated with group info */}
      <header className="sticky top-0 z-40 bg-white/90 backdrop-blur-md border-b border-slate-200 px-4 md:px-8 h-20 flex items-center justify-between shadow-sm print:hidden">
        <div className="flex items-center gap-6">
          <button 
            onClick={() => setCurrentStep('roteiro')} 
            className="p-2.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
            title="Voltar ao Roteiro"
          >
            <ChevronLeft size={24} />
          </button>
          <div className="flex flex-col">
            <h2 className="font-black text-slate-900 text-base md:text-lg tracking-tight leading-tight">
              {activeTab === 'lampada' ? 'Experimento 1: Lâmpada de Tungstênio' : 'Experimento 2: Diodos Emissores de Luz (LEDs)'}
            </h2>
            {turma && (
              <div className="flex items-center gap-2 text-[11px] text-slate-500 font-bold uppercase tracking-wider">
                <span className="text-blue-600">{turma}</span>
                {professor && (
                  <>
                    <span className="text-slate-300">•</span>
                    <span>Prof. {professor}</span>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="hidden lg:flex flex-col items-end gap-0.5 max-w-[300px]">
             <div className="flex items-center gap-1.5 text-slate-400">
               <Users size={12} />
               <span className="text-[10px] font-bold uppercase tracking-widest">Componentes</span>
             </div>
             <span className="text-[11px] font-bold text-slate-700 truncate w-full text-right">
               {componentes.filter(c => c.trim()).join(', ') || 'Nenhum integrante'}
             </span>
          </div>
          <div className="h-8 w-px bg-slate-200 hidden lg:block" />
          <button 
            onClick={() => setShowResetConfirm(true)}
            className="p-2.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition-all"
            title="Reiniciar Experimento (Limpa Tudo)"
          >
            <RotateCcw size={20} />
          </button>
          <div className="h-8 w-px bg-slate-200 hidden lg:block" />
          <button 
            onClick={clearCurrentData}
            className="p-2.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all"
            title="Limpar Dados da Tabela"
          >
            <Eraser size={20} />
          </button>
        </div>
      </header>

      {/* Reset Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white rounded-[2rem] shadow-2xl max-w-md w-full p-8 space-y-6 animate-in zoom-in-95 duration-300">
            <div className="w-16 h-16 bg-red-50 text-red-600 rounded-2xl flex items-center justify-center mx-auto">
              <RotateCcw size={32} />
            </div>
            <div className="text-center space-y-2">
              <h3 className="text-2xl font-black text-slate-900">Reiniciar Experimento?</h3>
              <p className="text-slate-500 font-medium">
                Isso irá apagar <strong>todos</strong> os dados, desenhos e informações do grupo. Esta ação não pode ser desfeita.
              </p>
            </div>
            <div className="flex gap-3">
              <button 
                onClick={() => setShowResetConfirm(false)}
                className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-all"
              >
                Cancelar
              </button>
              <button 
                onClick={resetAll}
                className="flex-1 py-4 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 shadow-lg shadow-red-100 transition-all"
              >
                Sim, Reiniciar
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-4xl mx-auto p-4 md:p-8 space-y-12 pb-32 print:hidden">
        {/* Experiment Selector Tabs - More integrated */}
        <div className="space-y-4">
          <div className="flex p-1.5 bg-slate-100 rounded-2xl border border-slate-200 shadow-inner">
            <button
              onClick={() => setActiveTab('lampada')}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-4 rounded-xl font-bold text-xs md:text-sm transition-all duration-300",
                activeTab === 'lampada' ? "bg-white text-blue-600 shadow-md scale-[1.01]" : "text-slate-500 hover:text-slate-700 hover:bg-white/50"
              )}
            >
              <Lightbulb size={18} className={activeTab === 'lampada' ? "text-blue-600" : ""} />
              Experimento 1: Lâmpada
            </button>
            <button
              onClick={() => setActiveTab('led_vermelho')}
              className={cn(
                "flex-1 flex items-center justify-center gap-2 py-4 rounded-xl font-bold text-xs md:text-sm transition-all duration-300",
                activeTab !== 'lampada' ? "bg-white text-blue-600 shadow-md scale-[1.01]" : "text-slate-500 hover:text-slate-700 hover:bg-white/50"
              )}
            >
              <Zap size={18} className={activeTab !== 'lampada' ? "text-blue-600" : ""} />
              Experimento 2: LEDs
            </button>
          </div>

          {activeTab !== 'lampada' && (
            <div className="flex p-1 bg-slate-50 rounded-xl border border-slate-200 w-fit mx-auto">
              <button
                onClick={() => setActiveTab('led_vermelho')}
                className={cn(
                  "px-6 py-2 rounded-lg font-bold text-xs transition-all",
                  activeTab === 'led_vermelho' ? "bg-white text-red-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
                )}
              >
                LED Vermelho
              </button>
              <button
                onClick={() => setActiveTab('led_verde')}
                className={cn(
                  "px-6 py-2 rounded-lg font-bold text-xs transition-all",
                  activeTab === 'led_verde' ? "bg-white text-green-600 shadow-sm" : "text-slate-400 hover:text-slate-600"
                )}
              >
                LED Verde
              </button>
            </div>
          )}
        </div>

        {/* Experiment Specific Roadmap (Passo a Passo) */}
        <section className="bg-blue-600 rounded-3xl p-8 text-white shadow-xl shadow-blue-100 space-y-6">
          <div className="flex items-center gap-2 text-blue-100">
            <ClipboardList size={20} />
            <h3 className="font-bold uppercase text-xs tracking-widest">
              Passo a Passo: {activeTab === 'lampada' ? 'Lâmpada' : (activeTab === 'led_vermelho' ? 'LED Vermelho' : 'LED Verde')}
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-bold shrink-0 text-sm">1</div>
              <div className="space-y-1">
                <p className="font-bold text-sm">Montagem</p>
                <p className="text-[11px] text-blue-100 leading-tight">
                  {activeTab === 'lampada' 
                    ? 'Conecte a fonte DC em série com a lâmpada e o multímetro (amperímetro).' 
                    : `Conecte a fonte DC em série com o resistor de 27Ω e o LED (${activeTab === 'led_vermelho' ? 'Vermelho' : 'Verde'}).`}
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-bold shrink-0 text-sm">2</div>
              <div className="space-y-1">
                <p className="font-bold text-sm">Medição I vs V</p>
                <p className="text-[11px] text-blue-100 leading-tight">
                  {activeTab === 'lampada'
                    ? 'Varie a tensão de 0V a 12V em passos de 1V, anotando a corrente correspondente.'
                    : 'Varie a tensão lentamente. Após o brilho inicial, use passos de 0.1V para capturar a curva com precisão.'}
                </p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center font-bold shrink-0 text-sm">3</div>
              <div className="space-y-1">
                <p className="font-bold text-sm">Registro</p>
                <p className="text-[11px] text-blue-100 leading-tight">
                  Insira os valores na tabela e utilize as ferramentas de pontos e linha para construir o gráfico.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Parameters Section - Only for Lamp */}
        {activeTab === 'lampada' && (
          <div className="space-y-8">
            <section className="bg-white rounded-3xl border border-slate-200 p-8 shadow-sm space-y-8">
              <div className="flex items-center gap-2 text-slate-400 border-b border-slate-50 pb-4">
                <Settings size={16} />
                <span className="text-[10px] font-bold uppercase tracking-widest">Configurações e Parâmetros</span>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-3">
                  <label className="text-[11px] font-bold text-slate-500 uppercase px-1 flex justify-between">
                    <span>Resistência a Frio (R₀)</span>
                    <span className="text-blue-600 lowercase font-normal italic">Medida com multímetro</span>
                  </label>
                  <div className="relative group">
                    <input
                      type="number"
                      value={lampRT ?? ''}
                      onChange={(e) => setLampRT(e.target.value === '' ? undefined : parseFloat(e.target.value))}
                      className="w-full pl-6 pr-12 py-5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all font-black text-2xl text-slate-800 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      placeholder=""
                    />
                    <span className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-300 font-black text-2xl">Ω</span>
                  </div>
                </div>
                <div className="space-y-3">
                  <label className="text-[11px] font-bold text-slate-500 uppercase px-1">Coeficiente de Temperatura</label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.0001"
                      value={alpha}
                      onChange={(e) => setAlpha(parseFloat(e.target.value) || 0)}
                      className="w-full px-6 py-5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all font-black text-2xl text-slate-800 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">°C⁻¹</span>
                  </div>
                </div>

                <div className="space-y-3">
                  <label className="text-[11px] font-bold text-slate-500 uppercase px-1">Temperatura Inicial (T₀)</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={tempIni}
                      onChange={(e) => setTempIni(parseFloat(e.target.value) || 0)}
                      className="w-full px-6 py-5 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all font-black text-2xl text-slate-800 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-300 font-black text-2xl">°C</span>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* Data Tables - Single Column Stack */}
        <div className="space-y-12">
          {/* Data Entry Table */}
          <section className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="p-8 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="space-y-1">
                <h3 className="font-black text-slate-900 text-xl flex items-center gap-3">
                  <TableIcon size={24} className="text-blue-600" />
                  Coleta de Dados: {activeTab === 'lampada' ? 'Lâmpada' : (activeTab === 'led_vermelho' ? 'LED Vermelho' : 'LED Verde')}
                </h3>
                <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Entrada de valores experimentais</p>
              </div>
              <button
                onClick={addDataRow}
                className="flex items-center gap-2 px-6 py-3.5 bg-blue-600 text-white text-xs font-black uppercase tracking-widest rounded-2xl hover:bg-blue-700 transition-all shadow-xl shadow-blue-200 active:scale-95"
              >
                <Plus size={18} />
                Adicionar Ponto
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/30">
                    <th className="px-6 py-5 text-[11px] font-black text-slate-400 tracking-[0.15em]">corrente (mA)</th>
                    <th className="px-6 py-5 text-[11px] font-black text-slate-400 tracking-[0.15em]">tensão (V)</th>
                    <th className="px-6 py-5 w-20"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {currentData.map((row) => (
                    <tr key={row.id} className="group hover:bg-blue-50/30 transition-colors">
                      <td className="px-6 py-5">
                        <input
                          type="number"
                          value={row.current ?? ''}
                          onChange={(e) => updateDataRow(row.id, 'current', e.target.value === '' ? undefined : parseFloat(e.target.value))}
                          className="w-full bg-transparent border-none focus:ring-0 text-xl font-black p-0 text-slate-800 placeholder:text-slate-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          placeholder=""
                        />
                      </td>
                      <td className="px-6 py-5">
                        <input
                          type="number"
                          step="0.1"
                          value={row.voltage ?? ''}
                          onChange={(e) => updateDataRow(row.id, 'voltage', e.target.value === '' ? undefined : parseFloat(e.target.value))}
                          className="w-full bg-transparent border-none focus:ring-0 text-xl font-black p-0 text-slate-800 placeholder:text-slate-200 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          placeholder=""
                        />
                      </td>
                      <td className="px-6 py-5 text-right">
                        <button
                          onClick={() => removeDataRow(row.id)}
                          className="p-2.5 text-slate-200 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 size={20} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        {/* Graph Section - Full Width and Fluid */}
        <div className="bg-white rounded-[2.5rem] border border-slate-200 shadow-xl shadow-slate-200/50 p-6 md:p-10 space-y-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-1">
              <h3 className="font-black text-slate-900 text-2xl flex items-center gap-3">
                <BarChart3 size={28} className="text-blue-600" />
                Gráfico I vs V
              </h3>
            </div>
            
            <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
              <button
                onClick={() => setActiveTool('point')}
                className={cn(
                  "flex items-center gap-2 px-5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all",
                  activeTool === 'point' ? "bg-blue-600 text-white shadow-md" : "text-slate-500 hover:text-slate-700"
                )}
              >
                <Dot size={16} /> Pontos
              </button>
              <button
                onClick={() => setActiveTool('line')}
                className={cn(
                  "flex items-center gap-2 px-5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all",
                  activeTool === 'line' ? "bg-blue-600 text-white shadow-md" : "text-slate-500 hover:text-slate-700"
                )}
              >
                <Spline size={16} /> Linha
              </button>
              <button
                onClick={() => setActiveTool('eraser')}
                className={cn(
                  "flex items-center gap-2 px-5 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all",
                  activeTool === 'eraser' ? "bg-red-600 text-white shadow-md" : "text-slate-500 hover:text-slate-700"
                )}
              >
                <Eraser size={16} /> Borracha
              </button>
              <div className="w-px h-8 bg-slate-200 mx-1" />
              
              {/* Color Selection */}
              <div className="flex items-center gap-1.5 px-2">
                {[
                  { name: 'Azul', value: '#2563eb' },
                  { name: 'Vermelho', value: '#dc2626' },
                ].map((color) => (
                  <button
                    key={color.value}
                    onClick={() => setSelectedColor(color.value)}
                    className={cn(
                      "w-6 h-6 rounded-full border-2 transition-all",
                      selectedColor === color.value ? "border-slate-400 scale-110" : "border-transparent hover:scale-105"
                    )}
                    style={{ backgroundColor: color.value }}
                    title={color.name}
                  />
                ))}
              </div>

              <div className="w-px h-8 bg-slate-200 mx-1" />
              <div className="flex items-center gap-1">
                <button
                  onClick={undoManualAction}
                  disabled={manualHistory.length === 0}
                  className="p-2.5 text-slate-400 hover:text-blue-600 disabled:opacity-30 transition-all"
                  title="Desfazer (Ctrl+Z)"
                >
                  <Undo2 size={22} />
                </button>
                <button
                  onClick={redoManualAction}
                  disabled={redoHistory.length === 0}
                  className="p-2.5 text-slate-400 hover:text-blue-600 disabled:opacity-30 transition-all"
                  title="Refazer (Ctrl+Y)"
                >
                  <Redo2 size={22} />
                </button>
              </div>
              <button
                onClick={clearManualPoints}
                className="flex items-center gap-2 px-4 py-2.5 text-red-500 hover:bg-red-50 rounded-xl transition-all text-[11px] font-black uppercase tracking-wider"
                title="Limpar Gráfico"
              >
                <Trash2 size={18} /> Limpar
              </button>
            </div>
          </div>

          <div className="h-[500px] md:h-[700px] bg-white rounded-3xl border border-slate-100 relative overflow-hidden cursor-default shadow-inner group">
            <ResponsiveContainer width="100%" height="100%" key={`${activeTab}-${chartScales[activeTab].x.max}-${chartScales[activeTab].y.max}`}>
              <ScatterChart margin={{ top: 40, right: 40, left: 80, bottom: 80 }}>
                {/* Millimeter Paper Grid */}
                {(() => {
                  const currentScale = chartScales[activeTab];
                  return (
                    <>
                      {currentScale.x.minorTicks.map(x => <ReferenceLine key={`mx-${x}`} x={x} stroke="#f1f5f9" strokeWidth={0.5} isAnimationActive={false} />)}
                      {currentScale.y.minorTicks.map(y => <ReferenceLine key={`my-${y}`} y={y} stroke="#f1f5f9" strokeWidth={0.5} isAnimationActive={false} />)}
                      {currentScale.x.ticks.map(v => <ReferenceLine key={`v-${v}`} x={v} stroke="#94a3b8" strokeWidth={1} isAnimationActive={false} />)}
                      {currentScale.y.ticks.map(h => <ReferenceLine key={`h-${h}`} y={h} stroke="#94a3b8" strokeWidth={1} isAnimationActive={false} />)}
                    </>
                  );
                })()}
                
                <XAxis 
                  type="number" 
                  dataKey="x" 
                  name="Tensão" 
                  unit="" 
                  domain={[0, chartScales[activeTab].x.max]} 
                  ticks={chartScales[activeTab].x.ticks}
                  stroke="#000000"
                  fontSize={14}
                  fontWeight="900"
                  tick={{ fill: '#000000', fontWeight: '900' }}
                  label={{ value: 'tensão (V)', position: 'bottom', offset: 10, fontSize: 14, fontWeight: '900', fill: '#000000' }}
                  isAnimationActive={false}
                  axisLine={{ strokeWidth: 3 }}
                  tickLine={{ strokeWidth: 2 }}
                />
                <YAxis 
                  type="number" 
                  dataKey="y" 
                  name="corrente" 
                  unit="" 
                  domain={[0, chartScales[activeTab].y.max]} 
                  ticks={chartScales[activeTab].y.ticks}
                  stroke="#000000"
                  fontSize={14}
                  fontWeight="900"
                  tick={{ fill: '#000000', fontWeight: '900' }}
                  label={{ value: 'corrente (mA)', angle: -90, position: 'left', offset: 40, fontSize: 14, fontWeight: '900', fill: '#000000' }}
                  isAnimationActive={false}
                  axisLine={{ strokeWidth: 3 }}
                  tickLine={{ strokeWidth: 2 }}
                />
                <ReferenceLine x={0} stroke="#000" strokeWidth={3} isAnimationActive={false} />
                <ReferenceLine y={0} stroke="#000" strokeWidth={3} isAnimationActive={false} />
                
                {/* Dummy point to force grid rendering when no data exists */}
                <Scatter data={[{ x: 0, y: 0 }]} fill="transparent" isAnimationActive={false} />
                
                {/* Automatic points from table */}
                <Scatter 
                  key={`auto-points-${activeTab}`}
                  name="Dados Experimentais" 
                  data={currentData
                    .filter(p => 
                      typeof p.voltage === 'number' && !isNaN(p.voltage) && 
                      typeof p.current === 'number' && !isNaN(p.current)
                    )
                    .map(p => ({ x: p.voltage, y: p.current }))} 
                  fill="#0f172a" 
                  shape={(props: any) => {
                    const { cx, cy } = props;
                    return <circle cx={cx} cy={cy} r={5} fill="#0f172a" stroke="none" />;
                  }}
                  isAnimationActive={false}
                />
                
                {drawnLines.map((line, idx) => (
                  <Scatter 
                    key={idx} 
                    data={line.points} 
                    fill={line.color} 
                    line={line.points.length > 1 ? { stroke: line.color, strokeWidth: 3 } : false} 
                    shape={line.points.length === 1 ? "circle" : () => null} 
                    isAnimationActive={false}
                  />
                ))}
              </ScatterChart>
            </ResponsiveContainer>

            {/* Click Overlay - Transparent div on top of chart for drawing */}
            <div 
              className="absolute inset-0 z-20" 
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onTouchStart={(e) => {
                const point = getPointFromEvent(e);
                if (!point) return;
                
                e.preventDefault();

                if (activeTool === 'point') {
                  setManualHistory(prev => [...prev, drawnLines]);
                  setRedoHistory([]);
                  setDrawnLines(prev => [...prev, { points: [point], color: selectedColor }]);
                } else if (activeTool === 'line') {
                  setIsDrawing(true);
                  setManualHistory(prev => [...prev, drawnLines]);
                  setRedoHistory([]);
                  setDrawnLines(prev => [...prev, { points: [point], color: selectedColor }]);
                } else if (activeTool === 'eraser') {
                  setManualHistory(prev => [...prev, drawnLines]);
                  setRedoHistory([]);
                  setDrawnLines(prev => prev.filter(line => 
                    !line.points.some(p => Math.hypot(p.x - point.x, (p.y - point.y)/20) < 0.8)
                  ));
                }
              }}
              onTouchMove={(e) => {
                const point = getPointFromEvent(e);
                if (isDrawing && activeTool === 'line') {
                  if (point) {
                    e.preventDefault();
                    setDrawnLines(prev => {
                      if (prev.length === 0) return prev;
                      const newLines = [...prev];
                      const lastLine = newLines[newLines.length - 1];
                      newLines[newLines.length - 1] = {
                        ...lastLine,
                        points: [...lastLine.points, point]
                      };
                      return newLines;
                    });
                  }
                }
              }}
              onTouchEnd={() => {
                setIsDrawing(false);
              }}
            />

            {/* Custom Tooltip removed */}
          </div>
          
          <div className="flex flex-col sm:flex-row items-center justify-end gap-4 px-2">
            {/* Legend and toggle removed as requested */}
          </div>
        </div>

        {/* Analysis Section */}
        <section className="bg-white rounded-[2.5rem] border border-slate-200 shadow-sm p-8 space-y-8">
          <div className="space-y-1">
            <h3 className="font-black text-slate-900 text-xl flex items-center gap-3">
              <FileText size={24} className="text-blue-600" />
              Análise dos Resultados: {activeTab === 'lampada' ? 'Lâmpada' : (activeTab === 'led_vermelho' ? 'LED Vermelho' : 'LED Verde')}
            </h3>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">
              {activeTab === 'lampada' ? '' : 'Responda às questões com base nos dados coletados'}
            </p>
          </div>

          {activeTab === 'lampada' ? (
            <div className="space-y-8">
              <h3 className="text-xl font-black text-slate-800 flex items-center gap-3">
                <div className="w-2 h-8 bg-blue-600 rounded-full" />
                Análise: Lâmpada de Tungstênio
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <label className="text-sm font-bold text-slate-700">Resistência Máxima (R)</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={maxResistance ?? ''}
                      onChange={(e) => setMaxResistance(e.target.value === '' ? undefined : parseFloat(e.target.value))}
                      className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all font-black text-xl text-slate-800"
                      placeholder=""
                    />
                    <span className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-300 font-black text-xl">Ω</span>
                  </div>
                </div>
                <div className="space-y-4">
                  <label className="text-sm font-bold text-slate-700">Temperatura Máxima (T)</label>
                  <div className="relative">
                    <input
                      type="number"
                      value={maxTemperature ?? ''}
                      onChange={(e) => setMaxTemperature(e.target.value === '' ? undefined : parseFloat(e.target.value))}
                      className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all font-black text-xl text-slate-800"
                      placeholder=""
                    />
                    <span className="absolute right-6 top-1/2 -translate-y-1/2 text-slate-300 font-black text-xl">°C</span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <label className="text-sm font-bold text-slate-700">1. A lâmpada se comporta como um dispositivo ôhmico? Justifique com base na variação da resistência com a temperatura.</label>
                <textarea
                  value={analysisText}
                  onChange={(e) => setAnalysisText(e.target.value)}
                  className="w-full h-48 p-8 bg-slate-50 border border-slate-200 rounded-[2rem] focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all font-medium text-slate-700 resize-none leading-relaxed"
                  placeholder=""
                />
              </div>
            </div>
          ) : (
            <div className="space-y-8">
              <h3 className="text-xl font-black text-slate-800 flex items-center gap-3">
                <div className="w-2 h-8 bg-slate-900 rounded-full" />
                Análise: LEDs (Verde e Vermelho)
              </h3>
              <div className="space-y-8">
                <div className="space-y-4">
                  <label className="text-sm font-bold text-slate-700">1. Os dois LEDs se comportam como dispositivos ôhmicos? Justifique.</label>
                  <textarea
                    value={ledUnifiedQuestions.q1}
                    onChange={(e) => setLedUnifiedQuestions(prev => ({ ...prev, q1: e.target.value }))}
                    className="w-full h-32 p-6 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all font-medium text-slate-700 resize-none"
                    placeholder=""
                  />
                </div>

                <div className="space-y-4">
                  <label className="text-sm font-bold text-slate-700">2. Qual a tensão limiar observada para cada cor de LED? Qual LED exige maior tensão para conduzir? Justifique.</label>
                  <textarea
                    value={ledUnifiedQuestions.q2}
                    onChange={(e) => setLedUnifiedQuestions(prev => ({ ...prev, q2: e.target.value }))}
                    className="w-full h-32 p-6 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-2 focus:ring-blue-500 focus:bg-white outline-none transition-all font-medium text-slate-700 resize-none"
                    placeholder=""
                  />
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Final Actions - Large Buttons */}
        <div className="flex flex-col sm:flex-row gap-6 pt-12">
          <button 
            className={cn(
              "flex-1 py-6 bg-slate-900 text-white rounded-[2rem] font-black text-xl shadow-2xl shadow-slate-200 hover:bg-slate-800 hover:-translate-y-1 transition-all flex items-center justify-center gap-4 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed",
              isGeneratingPDF && "animate-pulse"
            )}
            onClick={generatePDF}
            disabled={isGeneratingPDF}
          >
            <ClipboardList size={26} />
            {isGeneratingPDF ? 'Gerando...' : 'Gerar Relatório PDF'}
          </button>
        </div>
      </main>

      <div style={{ position: 'fixed', left: '-10000px', top: 0, pointerEvents: 'none', visibility: 'visible', opacity: 1 }}>
        <div ref={lampChartRef} key={`pdf-lamp-${chartScales.lampada.x.max}-${chartScales.lampada.y.max}`} style={{ width: '1200px', height: '900px', backgroundColor: '#ffffff', padding: '60px' }}>
          <ScatterChart width={1080} height={780} margin={{ top: 40, right: 40, left: 120, bottom: 100 }}>
            {/* Millimeter Paper Grid */}
            {chartScales.lampada.x.minorTicks.map(x => <ReferenceLine key={`mx-${x}`} x={x} stroke="#f1f5f9" strokeWidth={0.5} isAnimationActive={false} />)}
            {chartScales.lampada.y.minorTicks.map(y => <ReferenceLine key={`my-${y}`} y={y} stroke="#f1f5f9" strokeWidth={0.5} isAnimationActive={false} />)}
            {chartScales.lampada.x.ticks.map(v => <ReferenceLine key={`v-${v}`} x={v} stroke="#94a3b8" strokeWidth={1} isAnimationActive={false} />)}
            {chartScales.lampada.y.ticks.map(h => <ReferenceLine key={`h-${h}`} y={h} stroke="#94a3b8" strokeWidth={1} isAnimationActive={false} />)}
            
            <XAxis 
              type="number" dataKey="x" domain={[0, chartScales.lampada.x.max]} ticks={chartScales.lampada.x.ticks} stroke="#000000" fontSize={18} fontWeight="900"
              tick={{ fill: '#000000', fontWeight: '900' }}
              label={{ value: 'tensão (V)', position: 'bottom', offset: 40, fontSize: 20, fontWeight: '900', fill: '#000000' }}
              isAnimationActive={false} axisLine={{ strokeWidth: 4 }} tickLine={{ strokeWidth: 3 }}
              height={80}
            />
            <YAxis 
              type="number" dataKey="y" domain={[0, chartScales.lampada.y.max]} ticks={chartScales.lampada.y.ticks} stroke="#000000" fontSize={18} fontWeight="900"
              tick={{ fill: '#000000', fontWeight: '900' }}
              label={{ value: 'corrente (mA)', angle: -90, position: 'left', offset: 80, fontSize: 24, fontWeight: '900', fill: '#000000' }}
              isAnimationActive={false} axisLine={{ strokeWidth: 4 }} tickLine={{ strokeWidth: 3 }}
            />
            <ReferenceLine x={0} stroke="#000" strokeWidth={4} isAnimationActive={false} />
            <ReferenceLine y={0} stroke="#000" strokeWidth={4} isAnimationActive={false} />
            <Scatter data={[{ x: 0, y: 0 }]} fill="transparent" isAnimationActive={false} />
            
            {/* Automatic points from table */}
            <Scatter 
              data={lampData
                .filter(p => 
                  typeof p.voltage === 'number' && !isNaN(p.voltage) && 
                  typeof p.current === 'number' && !isNaN(p.current)
                )
                .map(p => ({ x: p.voltage, y: p.current }))} 
              fill="#0f172a" 
              shape={(props: any) => {
                const { cx, cy, fill } = props;
                return <circle cx={cx} cy={cy} r={6} fill={fill} stroke="none" />;
              }}
              isAnimationActive={false}
            />
            
            {lampLines.map((line, idx) => (
              <Scatter 
                key={idx} 
                data={line.points} 
                fill={line.color} 
                line={line.points.length > 1 ? { stroke: line.color, strokeWidth: 4 } : false} 
                shape={(props: any) => {
                  const { cx, cy, fill } = props;
                  return <circle cx={cx} cy={cy} r={8} fill={fill} stroke="none" />;
                }}
                isAnimationActive={false}
              />
            ))}
          </ScatterChart>
        </div>
        <div ref={ledVermelhoChartRef} key={`pdf-red-${chartScales.led_vermelho.x.max}-${chartScales.led_vermelho.y.max}`} style={{ width: '1200px', height: '900px', backgroundColor: '#ffffff', padding: '60px' }}>
          <ScatterChart width={1080} height={780} margin={{ top: 40, right: 40, left: 120, bottom: 100 }}>
            {/* Millimeter Paper Grid */}
            {chartScales.led_vermelho.x.minorTicks.map(x => <ReferenceLine key={`mx-${x}`} x={x} stroke="#f1f5f9" strokeWidth={0.5} isAnimationActive={false} />)}
            {chartScales.led_vermelho.y.minorTicks.map(y => <ReferenceLine key={`my-${y}`} y={y} stroke="#f1f5f9" strokeWidth={0.5} isAnimationActive={false} />)}
            {chartScales.led_vermelho.x.ticks.map(v => <ReferenceLine key={`v-${v}`} x={v} stroke="#94a3b8" strokeWidth={1} isAnimationActive={false} />)}
            {chartScales.led_vermelho.y.ticks.map(h => <ReferenceLine key={`h-${h}`} y={h} stroke="#94a3b8" strokeWidth={1} isAnimationActive={false} />)}
            
            <XAxis 
              type="number" dataKey="x" domain={[0, chartScales.led_vermelho.x.max]} ticks={chartScales.led_vermelho.x.ticks} stroke="#000000" fontSize={18} fontWeight="900"
              tick={{ fill: '#000000', fontWeight: '900' }}
              label={{ value: 'tensão (V)', position: 'bottom', offset: 40, fontSize: 20, fontWeight: '900', fill: '#000000' }}
              isAnimationActive={false} axisLine={{ strokeWidth: 4 }} tickLine={{ strokeWidth: 3 }}
              height={80}
            />
            <YAxis 
              type="number" dataKey="y" domain={[0, chartScales.led_vermelho.y.max]} ticks={chartScales.led_vermelho.y.ticks} stroke="#000000" fontSize={18} fontWeight="900"
              tick={{ fill: '#000000', fontWeight: '900' }}
              label={{ value: 'corrente (mA)', angle: -90, position: 'left', offset: 80, fontSize: 24, fontWeight: '900', fill: '#000000' }}
              isAnimationActive={false} axisLine={{ strokeWidth: 4 }} tickLine={{ strokeWidth: 3 }}
            />
            <ReferenceLine x={0} stroke="#000" strokeWidth={4} isAnimationActive={false} />
            <ReferenceLine y={0} stroke="#000" strokeWidth={4} isAnimationActive={false} />
            <Scatter data={[{ x: 0, y: 0 }]} fill="transparent" isAnimationActive={false} />
            
            {/* Automatic points from table */}
            <Scatter 
              data={ledVermelhoData
                .filter(p => 
                  typeof p.voltage === 'number' && !isNaN(p.voltage) && 
                  typeof p.current === 'number' && !isNaN(p.current)
                )
                .map(p => ({ x: p.voltage, y: p.current }))} 
              fill="#0f172a" 
              shape={(props: any) => {
                const { cx, cy, fill } = props;
                return <circle cx={cx} cy={cy} r={6} fill={fill} stroke="none" />;
              }}
              isAnimationActive={false}
            />
            
            {ledVermelhoLines.map((line, idx) => (
              <Scatter 
                key={idx} 
                data={line.points} 
                fill={line.color} 
                line={line.points.length > 1 ? { stroke: line.color, strokeWidth: 4 } : false} 
                shape={(props: any) => {
                  const { cx, cy, fill } = props;
                  return <circle cx={cx} cy={cy} r={8} fill={fill} stroke="none" />;
                }}
                isAnimationActive={false}
              />
            ))}
          </ScatterChart>
        </div>
        <div ref={ledVerdeChartRef} key={`pdf-green-${chartScales.led_verde.x.max}-${chartScales.led_verde.y.max}`} style={{ width: '1200px', height: '900px', backgroundColor: '#ffffff', padding: '60px' }}>
          <ScatterChart width={1080} height={780} margin={{ top: 40, right: 40, left: 120, bottom: 100 }}>
            {/* Millimeter Paper Grid */}
            {chartScales.led_verde.x.minorTicks.map(x => <ReferenceLine key={`mx-${x}`} x={x} stroke="#f1f5f9" strokeWidth={0.5} isAnimationActive={false} />)}
            {chartScales.led_verde.y.minorTicks.map(y => <ReferenceLine key={`my-${y}`} y={y} stroke="#f1f5f9" strokeWidth={0.5} isAnimationActive={false} />)}
            {chartScales.led_verde.x.ticks.map(v => <ReferenceLine key={`v-${v}`} x={v} stroke="#94a3b8" strokeWidth={1} isAnimationActive={false} />)}
            {chartScales.led_verde.y.ticks.map(h => <ReferenceLine key={`h-${h}`} y={h} stroke="#94a3b8" strokeWidth={1} isAnimationActive={false} />)}
            
            <XAxis 
              type="number" dataKey="x" domain={[0, chartScales.led_verde.x.max]} ticks={chartScales.led_verde.x.ticks} stroke="#000000" fontSize={18} fontWeight="900"
              tick={{ fill: '#000000', fontWeight: '900' }}
              label={{ value: 'tensão (V)', position: 'bottom', offset: 40, fontSize: 20, fontWeight: '900', fill: '#000000' }}
              isAnimationActive={false} axisLine={{ strokeWidth: 4 }} tickLine={{ strokeWidth: 3 }}
              height={80}
            />
            <YAxis 
              type="number" dataKey="y" domain={[0, chartScales.led_verde.y.max]} ticks={chartScales.led_verde.y.ticks} stroke="#000000" fontSize={18} fontWeight="900"
              tick={{ fill: '#000000', fontWeight: '900' }}
              label={{ value: 'corrente (mA)', angle: -90, position: 'left', offset: 80, fontSize: 24, fontWeight: '900', fill: '#000000' }}
              isAnimationActive={false} axisLine={{ strokeWidth: 4 }} tickLine={{ strokeWidth: 3 }}
            />
            <ReferenceLine x={0} stroke="#000" strokeWidth={4} isAnimationActive={false} />
            <ReferenceLine y={0} stroke="#000" strokeWidth={4} isAnimationActive={false} />
            <Scatter data={[{ x: 0, y: 0 }]} fill="transparent" isAnimationActive={false} />
            
            {/* Automatic points from table */}
            <Scatter 
              data={ledVerdeData
                .filter(p => 
                  typeof p.voltage === 'number' && !isNaN(p.voltage) && 
                  typeof p.current === 'number' && !isNaN(p.current)
                )
                .map(p => ({ x: p.voltage, y: p.current }))} 
              fill="#0f172a" 
              shape={(props: any) => {
                const { cx, cy, fill } = props;
                return <circle cx={cx} cy={cy} r={6} fill={fill} stroke="none" />;
              }}
              isAnimationActive={false}
            />
            
            {ledVerdeLines.map((line, idx) => (
              <Scatter 
                key={idx} 
                data={line.points} 
                fill={line.color} 
                line={line.points.length > 1 ? { stroke: line.color, strokeWidth: 4 } : false} 
                shape={(props: any) => {
                  const { cx, cy, fill } = props;
                  return <circle cx={cx} cy={cy} r={8} fill={fill} stroke="none" />;
                }}
                isAnimationActive={false}
              />
            ))}
          </ScatterChart>
        </div>
      </div>

      {/* Print Report - Hidden on screen, visible on print */}
      <div 
        ref={reportRef}
        id="report-container"
        key={isGeneratingPDF ? 'generating' : 'idle'}
        style={{ 
          color: '#0f172a', 
          backgroundColor: '#ffffff', 
          width: '210mm',
          position: 'absolute',
          left: '-9999px',
          top: '0',
          visibility: 'visible',
          opacity: 0,
          pointerEvents: 'none'
        }}
        className="print:flex flex-col font-sans min-h-screen"
      >
        {/* Page 1: Capa Profissional */}
        <div className="p-24 flex flex-col justify-between min-h-[297mm] relative overflow-hidden" style={{ backgroundColor: '#ffffff' }}>
          {/* Decorative Elements */}
          <div className="absolute top-0 right-0 w-64 h-64 bg-blue-50 rounded-full -mr-32 -mt-32 opacity-50" />
          <div className="absolute bottom-0 left-0 w-96 h-96 bg-slate-50 rounded-full -ml-48 -mb-48 opacity-50" />
          
          <div className="space-y-12 relative z-10">
            <div className="flex items-center gap-6">
              <div className="w-20 h-20 bg-blue-600 rounded-3xl flex items-center justify-center shadow-xl shadow-blue-100">
                <Zap size={40} className="text-white" />
              </div>
              <div className="space-y-1">
                <h1 className="text-4xl font-black tracking-tighter" style={{ color: '#0f172a' }}>Laboratório de Física</h1>
                <p className="text-sm font-bold uppercase tracking-[0.4em]" style={{ color: '#94a3b8' }}>UFRN • Departamento de Física</p>
              </div>
            </div>

            <div className="pt-24 space-y-6">
              <h2 className="text-6xl font-black leading-[1.1] tracking-tight" style={{ color: '#0f172a' }}>
                Relatório de Prática Experimental
              </h2>
              <div className="h-2 w-32 bg-blue-600 rounded-full" />
              <p className="text-2xl font-medium max-w-2xl" style={{ color: '#64748b' }}>
                Estudo de Componentes Não-Ôhmicos: Lâmpada de Tungstênio e Diodos Emissores de Luz (LEDs)
              </p>
            </div>
          </div>

          <div className="space-y-12 relative z-10">
            <div className="grid grid-cols-2 gap-12">
              <div className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-[0.3em]" style={{ color: '#94a3b8' }}>Identificação da Turma</p>
                <p className="text-4xl font-black" style={{ color: '#2563eb' }}>{turma || '---'}</p>
              </div>
              <div className="space-y-3">
                <p className="text-xs font-bold uppercase tracking-[0.3em]" style={{ color: '#94a3b8' }}>Professor Responsável</p>
                <p className="text-2xl font-bold" style={{ color: '#0f172a' }}>{professor || '---'}</p>
              </div>
            </div>

            <div className="pt-12 border-t-2 flex justify-between items-end" style={{ borderColor: '#f1f5f9' }}>
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#94a3b8' }}>Local e Data</p>
                <p className="text-sm font-bold" style={{ color: '#475569' }}>Natal, RN • {new Date().toLocaleDateString('pt-BR')}</p>
              </div>
              <p className="text-[10px] font-black uppercase tracking-[0.5em]" style={{ color: '#cbd5e1' }}>Física Experimental II</p>
            </div>
          </div>
        </div>

        {/* Page 2: Roteiro Experimental */}
        <div className="p-20 space-y-12 min-h-[297mm]" style={{ backgroundColor: '#ffffff' }}>
          <div className="space-y-8">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-slate-900 rounded-2xl flex items-center justify-center">
                <BookOpen size={24} className="text-white" />
              </div>
              <h2 className="text-3xl font-black tracking-tight" style={{ color: '#0f172a' }}>Roteiro Experimental</h2>
            </div>

            <div className="grid grid-cols-1 gap-10">
              <section className="space-y-4">
                <h3 className="text-sm font-black uppercase tracking-widest border-b-2 pb-2" style={{ color: '#2563eb', borderColor: '#dbeafe' }}>1. Objetivos</h3>
                <ul className="text-sm space-y-3 list-disc pl-5 leading-relaxed" style={{ color: '#334155' }}>
                  <li>Levantar as curvas características I vs V para componentes não-ôhmicos (Lâmpada e LEDs).</li>
                  <li>Identificar a resistência a frio e a variação térmica em filamentos de tungstênio.</li>
                  <li>Determinar a tensão de limiar (Vᵧ) em LEDs de diferentes cores (Verde e Vermelho).</li>
                  <li>Analisar o comportamento da resistência dinâmica e a natureza não-linear desses dispositivos.</li>
                </ul>
              </section>

              <section className="space-y-4">
                <h3 className="text-sm font-black uppercase tracking-widest border-b-2 pb-2" style={{ color: '#2563eb', borderColor: '#dbeafe' }}>2. Materiais Utilizados</h3>
                <div className="grid grid-cols-2 gap-4">
                  <ul className="text-sm space-y-2 list-disc pl-5" style={{ color: '#334155' }}>
                    <li>Fonte de tensão DC variável (0-12V)</li>
                    <li>Multímetros Digitais (Amperímetro/Voltímetro)</li>
                  </ul>
                  <ul className="text-sm space-y-2 list-disc pl-5" style={{ color: '#334155' }}>
                    <li>Resistor de proteção (27 Ω)</li>
                    <li>Lâmpada e LEDs (Verde e Vermelho)</li>
                  </ul>
                </div>
              </section>

              <section className="space-y-4">
                <h3 className="text-sm font-black uppercase tracking-widest border-b-2 pb-2" style={{ color: '#2563eb', borderColor: '#dbeafe' }}>3. Fundamentação Teórica</h3>
                <div className="text-sm leading-relaxed space-y-4" style={{ color: '#334155' }}>
                  <p>
                    <strong>Lâmpada de Tungstênio:</strong> O filamento de uma lâmpada é um condutor metálico cuja resistência aumenta significativamente com a temperatura devido ao efeito Joule. Esse comportamento é descrito pela relação R(T) = R₀ [1 + α(T - T₀)], onde α é o coeficiente de variação térmica.
                  </p>
                  <p>
                    <strong>Diodos (LEDs):</strong> São dispositivos semicondutores que permitem a passagem de corrente apenas em um sentido e acima de uma tensão mínima, chamada tensão de limiar. Diferente dos resistores, sua relação I vs V é exponencial, tornando-os componentes fortemente não-ôhmicos.
                  </p>
                </div>
              </section>

              <section className="space-y-4">
                <h3 className="text-sm font-black uppercase tracking-widest border-b-2 pb-2" style={{ color: '#2563eb', borderColor: '#dbeafe' }}>4. Procedimento</h3>
                <p className="text-sm leading-relaxed" style={{ color: '#334155' }}>
                  O experimento consiste em variar a tensão da fonte e medir a corrente correspondente para cada componente. Os dados são organizados em tabelas e utilizados para construir os gráficos característicos, permitindo a análise visual e matemática do comportamento de cada dispositivo.
                </p>
              </section>
            </div>
          </div>
        </div>

        {/* Page 3: Identification & Experiment 1 */}
        <div className="p-20 space-y-12 min-h-[297mm]" style={{ backgroundColor: '#ffffff' }}>
          <div className="space-y-8 border-b-2 pb-8" style={{ borderColor: '#f1f5f9' }}>
            <h2 className="text-2xl font-black uppercase tracking-widest" style={{ color: '#2563eb' }}>Identificação do Grupo</h2>
            <div className="grid grid-cols-2 gap-x-12 gap-y-6">
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#94a3b8' }}>Turma</p>
                <p className="text-xl font-black" style={{ color: '#0f172a' }}>{turma || '---'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#94a3b8' }}>Professor</p>
                <p className="text-xl font-bold" style={{ color: '#1e293b' }}>{professor || '---'}</p>
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#94a3b8' }}>Data</p>
                <p className="text-xl font-bold" style={{ color: '#1e293b' }}>{new Date().toLocaleDateString('pt-BR')}</p>
              </div>
              <div className="col-span-2 space-y-3">
                <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: '#94a3b8' }}>Integrantes</p>
                <div className="grid grid-cols-2 gap-3">
                  {componentes.filter(c => c.trim()).map((c, i) => (
                    <p key={i} className="text-sm font-bold p-3 rounded-xl border" style={{ color: '#334155', backgroundColor: '#f8fafc', borderColor: '#f1f5f9' }}>{c}</p>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Experiment 1: Lamp */}
          <section className="space-y-8">
            <h2 className="text-2xl font-black border-b-4 pb-2" style={{ borderColor: '#3b82f6', color: '#0f172a' }}>Experimento 1: Lâmpada de Tungstênio</h2>
            
            <div className="grid grid-cols-1 gap-12">
              <div className="space-y-4">
                <h3 className="font-bold text-sm uppercase tracking-wider" style={{ color: '#94a3b8' }}>Dados Coletados</h3>
                <table className="w-full border-collapse border-2 text-sm" style={{ borderColor: '#cbd5e1' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f1f5f9' }}>
                      <th className="border-2 p-3" style={{ borderColor: '#cbd5e1', color: '#475569' }}>tensão (V)</th>
                      <th className="border-2 p-3" style={{ borderColor: '#cbd5e1', color: '#475569' }}>corrente (mA)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lampData.map((d, i) => (
                      <tr key={i}>
                        <td className="border-2 p-3 text-center font-medium" style={{ borderColor: '#cbd5e1', color: '#1e293b' }}>{d.voltage}</td>
                        <td className="border-2 p-3 text-center font-medium" style={{ borderColor: '#cbd5e1', color: '#1e293b' }}>{d.current}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="space-y-6">
                <div className="p-8 rounded-[2rem] border-2 space-y-4 shadow-sm" style={{ backgroundColor: '#f8fafc', borderColor: '#f1f5f9' }}>
                  <h3 className="font-bold text-xs uppercase tracking-widest" style={{ color: '#94a3b8' }}>Parâmetros e Resultados</h3>
                  <div className="grid grid-cols-2 gap-6">
                    <p className="text-base" style={{ color: '#1e293b' }}>Resistência a Frio (R₀): <strong className="text-blue-600">{lampRT} Ω</strong></p>
                    <p className="text-base" style={{ color: '#1e293b' }}>Coeficiente (α): <strong className="text-blue-600">{alpha} °C⁻¹</strong></p>
                    <p className="text-base" style={{ color: '#1e293b' }}>Temperatura Inicial (T₀): <strong className="text-blue-600">{tempIni} °C</strong></p>
                    <p className="text-base" style={{ color: '#1e293b' }}>Resistência Máxima: <strong className="text-blue-600">{maxResistance} Ω</strong></p>
                    <p className="text-base col-span-2" style={{ color: '#1e293b' }}>Temperatura Máxima Atingida: <strong className="text-blue-600 text-xl">{maxTemperature} °C</strong></p>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <h3 className="font-bold text-sm uppercase tracking-wider" style={{ color: '#94a3b8' }}>Gráfico Característico (V x I)</h3>
              <div className="w-full h-[500px] border rounded-3xl p-6 flex justify-center items-center shadow-sm" style={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0' }}>
                {lampChartImg ? (
                  <img src={lampChartImg} alt="Gráfico Lâmpada" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                ) : (
                  <div className="italic text-sm" style={{ color: '#cbd5e1' }}>Carregando gráfico...</div>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="font-bold text-sm uppercase tracking-wider" style={{ color: '#94a3b8' }}>Análise dos Resultados</h3>
              <p className="text-sm font-bold" style={{ color: '#1e293b' }}>A lâmpada se comporta como um dispositivo ôhmico? Justifique.</p>
              <p className="text-sm whitespace-pre-wrap leading-relaxed italic p-6 rounded-2xl border" style={{ backgroundColor: '#f8fafc', borderColor: '#e2e8f0', color: '#334155' }}>{analysisText || 'Não respondido.'}</p>
            </div>
          </section>
        </div>

        {/* Page 4: LED Vermelho */}
        <div className="p-20 space-y-12 min-h-[297mm]" style={{ backgroundColor: '#ffffff' }}>
          <section className="space-y-8">
            <h2 className="text-2xl font-black border-b-4 pb-2" style={{ borderColor: '#ef4444', color: '#0f172a' }}>Experimento 2: LED Vermelho</h2>
            
            <div className="grid grid-cols-1 gap-12">
              <div className="space-y-4">
                <h3 className="font-bold text-sm uppercase tracking-wider" style={{ color: '#94a3b8' }}>Dados Coletados</h3>
                <table className="w-full border-collapse border-2 text-sm" style={{ borderColor: '#cbd5e1' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#fef2f2' }}>
                      <th className="border-2 p-3" style={{ borderColor: '#cbd5e1', color: '#b91c1c' }}>tensão (V)</th>
                      <th className="border-2 p-3" style={{ borderColor: '#cbd5e1', color: '#b91c1c' }}>corrente (mA)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledVermelhoData.map((d, i) => (
                      <tr key={i}>
                        <td className="border-2 p-3 text-center font-medium" style={{ borderColor: '#cbd5e1', color: '#1e293b' }}>{d.voltage}</td>
                        <td className="border-2 p-3 text-center font-medium" style={{ borderColor: '#cbd5e1', color: '#1e293b' }}>{d.current}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="space-y-4">
              <h3 className="font-bold text-sm uppercase tracking-wider" style={{ color: '#94a3b8' }}>Gráfico Característico</h3>
              <div className="w-full h-[500px] border rounded-3xl p-6 flex justify-center items-center shadow-sm" style={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0' }}>
                {ledVermelhoChartImg ? (
                  <img src={ledVermelhoChartImg} alt="Gráfico LED Vermelho" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                ) : (
                  <div className="italic text-sm" style={{ color: '#cbd5e1' }}>Carregando gráfico...</div>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>

        {/* Page 5: LED Verde & Comparação */}
        <div className="p-20 space-y-12 min-h-[297mm]" style={{ backgroundColor: '#ffffff' }}>
          <section className="space-y-8">
            <h2 className="text-2xl font-black border-b-4 pb-2" style={{ borderColor: '#22c55e', color: '#0f172a' }}>Experimento 2: LED Verde</h2>
            
            <div className="grid grid-cols-1 gap-12">
              <div className="space-y-4">
                <h3 className="font-bold text-sm uppercase tracking-wider" style={{ color: '#94a3b8' }}>Dados Coletados</h3>
                <table className="w-full border-collapse border-2 text-sm" style={{ borderColor: '#cbd5e1' }}>
                  <thead>
                    <tr style={{ backgroundColor: '#f0fdf4' }}>
                      <th className="border-2 p-3" style={{ borderColor: '#cbd5e1', color: '#15803d' }}>tensão (V)</th>
                      <th className="border-2 p-3" style={{ borderColor: '#cbd5e1', color: '#15803d' }}>corrente (mA)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledVerdeData.map((d, i) => (
                      <tr key={i}>
                        <td className="border-2 p-3 text-center font-medium" style={{ borderColor: '#cbd5e1', color: '#1e293b' }}>{d.voltage}</td>
                        <td className="border-2 p-3 text-center font-medium" style={{ borderColor: '#cbd5e1', color: '#1e293b' }}>{d.current}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="space-y-4">
              <h3 className="font-bold text-sm uppercase tracking-wider" style={{ color: '#94a3b8' }}>Gráfico Característico</h3>
              <div className="w-full h-[500px] border rounded-3xl p-6 flex justify-center items-center shadow-sm" style={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0' }}>
                {ledVerdeChartImg ? (
                  <img src={ledVerdeChartImg} alt="Gráfico LED Verde" className="w-full h-full object-contain" referrerPolicy="no-referrer" />
                ) : (
                  <div className="italic text-sm" style={{ color: '#cbd5e1' }}>Carregando gráfico...</div>
                )}
              </div>
            </div>
          </div>
        </section>

          <section className="space-y-8 pt-12 border-t-4" style={{ borderColor: '#0f172a' }}>
            <h2 className="text-2xl font-black uppercase tracking-widest" style={{ color: '#0f172a' }}>Análise Comparativa: LEDs</h2>
            <div className="space-y-6">
              <div className="space-y-2">
                <p className="text-sm font-bold" style={{ color: '#1e293b' }}>1. Os dois LEDs se comportam como dispositivos ôhmicos? Justifique.</p>
                <p className="text-sm italic p-6 rounded-2xl border leading-relaxed" style={{ backgroundColor: '#f8fafc', borderColor: '#e2e8f0', color: '#334155' }}>{ledUnifiedQuestions.q1 || 'Não respondido.'}</p>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-bold" style={{ color: '#1e293b' }}>2. Qual a tensão limiar observada para cada cor de LED? Qual LED exige maior tensão para conduzir? Justifique.</p>
                <p className="text-sm italic p-6 rounded-2xl border leading-relaxed" style={{ backgroundColor: '#f8fafc', borderColor: '#e2e8f0', color: '#334155' }}>{ledUnifiedQuestions.q2 || 'Não respondido.'}</p>
              </div>
            </div>
          </section>

          <footer className="pt-12 text-center text-[10px] uppercase tracking-[0.2em]" style={{ color: '#94a3b8' }}>
            Gerado automaticamente pelo Laboratório Virtual de Física - UFRN
          </footer>
        </div>
      </div>
    </div>
  );
}
