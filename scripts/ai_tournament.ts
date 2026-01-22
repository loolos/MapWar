import fs from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { RandomAiProfiles, type AIProfile } from '../src/core/ai/AIProfile';
import {
    createSeededRandom,
    evaluateTournament,
    getActiveModes,
    rankResults,
    type TournamentOptions
} from './ai_tournament_lib';

type CliOptions = TournamentOptions & {
    profilesPath?: string;
};

const parseArgs = (): CliOptions => {
    const args = process.argv.slice(2);
    const options: CliOptions = {
        seed: Date.now(),
        matchesPerAi2p: 5,
        matchesPerAi4p: 3,
        matchesPerAi8p: 2,
        maxTurns2p: 50,
        maxTurns4p: 100,
        maxTurns8p: 150,
        winBonus2p: 1,
        winBonus4p: 2,
        winBonus8p: 4,
        mapTypes: ['default', 'archipelago', 'pangaea'],
        diversityWeight: 0.1,
        quiet: false,
        profilesPath: undefined
    };

    for (let i = 0; i < args.length; i++) {
        const arg = args[i];
        const next = args[i + 1];
        switch (arg) {
            case '--seed':
                options.seed = parseInt(next, 10);
                i++;
                break;
            case '--m2':
                options.matchesPerAi2p = Math.max(0, parseInt(next, 10));
                i++;
                break;
            case '--m4':
                options.matchesPerAi4p = Math.max(0, parseInt(next, 10));
                i++;
                break;
            case '--m8':
                options.matchesPerAi8p = Math.max(0, parseInt(next, 10));
                i++;
                break;
            case '--t2':
                options.maxTurns2p = Math.max(10, parseInt(next, 10));
                i++;
                break;
            case '--t4':
                options.maxTurns4p = Math.max(10, parseInt(next, 10));
                i++;
                break;
            case '--t8':
                options.maxTurns8p = Math.max(10, parseInt(next, 10));
                i++;
                break;
            case '--b2':
                options.winBonus2p = Math.max(0, parseFloat(next));
                i++;
                break;
            case '--b4':
                options.winBonus4p = Math.max(0, parseFloat(next));
                i++;
                break;
            case '--b8':
                options.winBonus8p = Math.max(0, parseFloat(next));
                i++;
                break;
            case '--maps':
                options.mapTypes = next.split(',').map((m) => m.trim()).filter(Boolean) as any;
                i++;
                break;
            case '--diversity':
                options.diversityWeight = Math.max(0, parseFloat(next));
                i++;
                break;
            case '--profiles':
                options.profilesPath = next;
                i++;
                break;
            case '--quiet':
                options.quiet = true;
                break;
            case '--verbose':
                options.quiet = false;
                break;
            default:
                break;
        }
    }

    return options;
};

const loadProfiles = (profilesPath?: string): AIProfile[] => {
    if (!profilesPath) return RandomAiProfiles.slice();
    const resolved = path.resolve(process.cwd(), profilesPath);
    if (!fs.existsSync(resolved)) {
        throw new Error(`Profiles file not found: ${resolved}`);
    }
    const raw = fs.readFileSync(resolved, 'utf-8');
    const parsed = JSON.parse(raw);
    const list: AIProfile[] = Array.isArray(parsed) ? parsed : parsed?.profiles;
    if (!Array.isArray(list)) {
        throw new Error('Profiles file must be an array or { profiles: [...] }');
    }
    return list.map((profile, index) => ({
        id: profile.id ?? `profile_${index + 1}`,
        label: profile.label,
        weights: profile.weights
    }));
};

const main = () => {
    const options = parseArgs();
    const activeModes = getActiveModes(options);
    if (!activeModes.use2p && !activeModes.use4p && !activeModes.use8p) {
        console.error('No match modes enabled. Set at least one of --m2/--m4/--m8 to a value greater than 0.');
        process.exit(1);
    }

    const profiles = loadProfiles(options.profilesPath);
    const rng = createSeededRandom(options.seed);
    const { results, avgMatchMs, avgMatchTurns } = evaluateTournament(profiles, options, 0, rng, activeModes);
    const { ranked, diversityById } = rankResults(results, rng, options.diversityWeight, activeModes);

    console.log('=== AI Tournament Rankings ===');
    const formatAvg = (key: '2p' | '4p' | '8p') => {
        const value = avgMatchMs[key];
        return value !== null ? `${Math.round(value)}ms` : '-';
    };
    const formatTurns = (key: '2p' | '4p' | '8p') => {
        const value = avgMatchTurns[key];
        return value !== null ? value.toFixed(1) : '-';
    };
    console.log(`AvgMatchMs: ${activeModes.use2p ? formatAvg('2p') : '-'},${activeModes.use4p ? formatAvg('4p') : '-'},${activeModes.use8p ? formatAvg('8p') : '-'}`);
    console.log(`AvgMatchTurns: ${activeModes.use2p ? formatTurns('2p') : '-'},${activeModes.use4p ? formatTurns('4p') : '-'},${activeModes.use8p ? formatTurns('8p') : '-'}`);
    for (let i = 0; i < ranked.length; i++) {
        const ind = ranked[i];
        const diversityScore = diversityById.get(ind.profile.id) ?? 0;
        const normStr = `${activeModes.use2p ? ind.avgPointsNorm2p.toFixed(2) : '-'},${activeModes.use4p ? ind.avgPointsNorm4p.toFixed(2) : '-'},${activeModes.use8p ? ind.avgPointsNorm8p.toFixed(2) : '-'}`;
        const bonusStr = `${activeModes.use2p ? ind.avgDecisiveBonusNorm2p.toFixed(2) : '-'},${activeModes.use4p ? ind.avgDecisiveBonusNorm4p.toFixed(2) : '-'},${activeModes.use8p ? ind.avgDecisiveBonusNorm8p.toFixed(2) : '-'}`;
        const formatRate = (value: number, total: number) => Math.round(total > 0 ? (value / total) * 100 : 0).toString();
        const winStr = `${activeModes.use2p ? formatRate(ind.wins2p, ind.games2p) : '-'},${activeModes.use4p ? formatRate(ind.wins4p, ind.games4p) : '-'},${activeModes.use8p ? formatRate(ind.wins8p, ind.games8p) : '-'}`;
        const decisStr = `${activeModes.use2p ? formatRate(ind.decisiveGames2p, ind.games2p) : '-'},${activeModes.use4p ? formatRate(ind.decisiveGames4p, ind.games4p) : '-'},${activeModes.use8p ? formatRate(ind.decisiveGames8p, ind.games8p) : '-'}`;
        console.log(`  ${i + 1}. ${ind.profile.id} | Norm=${normStr} | Bonus=${bonusStr} | WinRate=${winStr}% | Decisive=${decisStr}% | Diversity=${diversityScore.toFixed(3)}`);
    }
};

const entryUrl = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === entryUrl) {
    main();
}
