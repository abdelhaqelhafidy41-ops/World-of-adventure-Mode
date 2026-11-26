import { SandboxTimeOfDay, SandboxWeather } from '@/src/types/sandbox';

export type ParsedConsoleCommand =
  | { kind: 'help' }
  | { kind: 'clear' }
  | { kind: 'reset' }
  | { kind: 'heal' }
  | { kind: 'list' }
  | { kind: 'god'; enabled?: boolean }
  | { kind: 'weather'; weather: SandboxWeather }
  | { kind: 'time'; timeOfDay: SandboxTimeOfDay }
  | { kind: 'tp'; x: number; y: number; z: number }
  | { kind: 'spawn'; entityId: string; count: number }
  | { kind: 'give'; itemId: string; count: number }
  | { kind: 'trigger'; eventName: string }
  | { kind: 'error'; message: string };

export const CONSOLE_COMMAND_SUGGESTIONS = [
  'help',
  'spawn ',
  'give ',
  'set weather clear',
  'set weather rain',
  'set weather storm',
  'set time dawn',
  'set time day',
  'set time dusk',
  'set time night',
  'tp 0 0 0',
  'god on',
  'god off',
  'heal',
  'trigger ',
  'list',
  'clear',
  'reset',
];

export function tokenizeConsoleInput(raw: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '"' || ch === "'") {
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && /\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
    } else {
      current += ch;
    }
  }
  if (current) tokens.push(current);
  return tokens;
}

/**
 * Pure tokenized command parser — never evaluates arbitrary code or JS expressions.
 */
export function parseDevConsoleCommand(rawInput: string): ParsedConsoleCommand {
  const clean = rawInput.trim().replace(/^\/+/, '');
  if (!clean) {
    return { kind: 'error', message: 'Empty command. Type "help" for available commands.' };
  }

  const tokens = tokenizeConsoleInput(clean);
  const head = tokens[0]?.toLowerCase();

  switch (head) {
    case 'help':
    case '?':
      return { kind: 'help' };
    case 'clear':
    case 'cls':
      return { kind: 'clear' };
    case 'reset':
      return { kind: 'reset' };
    case 'heal':
      return { kind: 'heal' };
    case 'list':
      return { kind: 'list' };
    case 'god': {
      const arg = tokens[1]?.toLowerCase();
      if (arg === 'on' || arg === 'true' || arg === '1') return { kind: 'god', enabled: true };
      if (arg === 'off' || arg === 'false' || arg === '0') return { kind: 'god', enabled: false };
      return { kind: 'god' };
    }
    case 'set': {
      const prop = tokens[1]?.toLowerCase();
      const val = tokens[2]?.toLowerCase();
      if (prop === 'weather') {
        if (val === 'clear' || val === 'rain' || val === 'storm') {
          return { kind: 'weather', weather: val };
        }
        return { kind: 'error', message: 'Usage: set weather <clear|rain|storm>' };
      }
      if (prop === 'time') {
        if (val === 'dawn' || val === 'day' || val === 'dusk' || val === 'night') {
          return { kind: 'time', timeOfDay: val };
        }
        return { kind: 'error', message: 'Usage: set time <dawn|day|dusk|night>' };
      }
      return { kind: 'error', message: 'Unknown "set" target. Try "set weather" or "set time".' };
    }
    case 'weather': {
      const val = tokens[1]?.toLowerCase();
      if (val === 'clear' || val === 'rain' || val === 'storm') {
        return { kind: 'weather', weather: val };
      }
      return { kind: 'error', message: 'Usage: weather <clear|rain|storm>' };
    }
    case 'time': {
      const val = tokens[1]?.toLowerCase();
      if (val === 'dawn' || val === 'day' || val === 'dusk' || val === 'night') {
        return { kind: 'time', timeOfDay: val };
      }
      return { kind: 'error', message: 'Usage: time <dawn|day|dusk|night>' };
    }
    case 'tp':
    case 'teleport': {
      const x = Number(tokens[1]);
      const y = Number(tokens[2] ?? 0);
      const z = Number(tokens[3] ?? tokens[2] ?? 0);
      if (tokens.length < 3 || Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(z)) {
        return { kind: 'error', message: 'Usage: tp <x> <y> <z>' };
      }
      return { kind: 'tp', x, y, z };
    }
    case 'spawn': {
      const entityId = tokens[1];
      if (!entityId) return { kind: 'error', message: 'Usage: spawn <entityId> [count]' };
      const count = Math.max(1, Math.min(10, Math.round(Number(tokens[2] ?? 1) || 1)));
      return { kind: 'spawn', entityId, count };
    }
    case 'give': {
      const itemId = tokens[1];
      if (!itemId) return { kind: 'error', message: 'Usage: give <itemId> [count]' };
      const count = Math.max(1, Math.min(99, Math.round(Number(tokens[2] ?? 1) || 1)));
      return { kind: 'give', itemId, count };
    }
    case 'trigger': {
      const eventName = tokens[1];
      if (!eventName) return { kind: 'error', message: 'Usage: trigger <logicEvent>' };
      return { kind: 'trigger', eventName };
    }
    default:
      return {
        kind: 'error',
        message: `Unknown command "${head}". Type "help" to list sandbox commands.`,
      };
  }
}
