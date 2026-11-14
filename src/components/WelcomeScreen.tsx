import { ArrowUpRight } from 'lucide-react';
import type { AssistantMode } from '../types/chat';
import { MULTILINGUAL_STARTERS } from '../utils/chatLogic';
import { BrandLogo } from './BrandLogo';

interface WelcomeScreenProps {
  onSelectPrompt: (prompt: string, mode?: AssistantMode) => void;
}

export function WelcomeScreen({ onSelectPrompt }: WelcomeScreenProps) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 sm:px-8 py-10 max-w-3xl mx-auto w-full">
      <div className="flex flex-col items-center text-center mb-8 sm:mb-10">
        <div className="mb-5">
          <BrandLogo size="lg" showWordmark={false} />
        </div>
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight text-[#FFFFFF] [text-wrap:balance]">
          Welcome to ARM AI
        </h1>
        <p className="mt-3 text-sm sm:text-base text-[#A0A0A0] max-w-xl leading-relaxed">
          Your intelligent personal assistant in English, বাংলা, and हिन्दी — powered by{' '}
          <span className="text-[#FFFFFF] font-medium">MEHEDI AI</span>. Reason through complex problems, analyze images or documents, write code, speak naturally, and research live knowledge.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
        {MULTILINGUAL_STARTERS.map((starter) => (
          <button
            key={starter.id}
            type="button"
            onClick={() => onSelectPrompt(starter.prompt, starter.mode)}
            className="group text-left p-4 rounded-2xl bg-[#111111] hover:bg-[#171717] border border-[#292929] hover:border-[#404040] transition-all cursor-pointer flex flex-col justify-between gap-2 min-h-[96px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FFFFFF]/30"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-sm font-medium text-[#FFFFFF] leading-snug">
                {starter.title}
              </span>
              <ArrowUpRight
                className="w-4 h-4 text-[#A0A0A0] group-hover:text-[#FFFFFF] shrink-0 mt-0.5 transition-colors"
                aria-hidden="true"
              />
            </div>
            <div className="flex items-center justify-between gap-2 text-xs text-[#A0A0A0]">
              <span className="truncate">{starter.subtitle}</span>
              <span className="text-[#FFFFFF]/80 shrink-0 font-medium">
                {starter.languageLabel}
              </span>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
