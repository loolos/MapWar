import { DefaultAIWeights, type AIProfile, type AIWeights } from '../src/core/ai/AIProfile';

type TraitName = 'Economy' | 'Defense' | 'Attack' | 'Expansion' | 'Town' | 'Aura';

type TraitScores = {
    scores: Record<TraitName, number>;
    hasFarm: boolean;
};

type LabelOptions = {
    existingLabels?: Set<string>;
};

const TRAITS: TraitName[] = ['Economy', 'Defense', 'Attack', 'Expansion', 'Town', 'Aura'];

const firstNames = [
    'Alice', 'Bob', 'Charlie', 'Diana', 'Eve', 'Frank', 'Grace', 'Henry',
    'Ivy', 'Jack', 'Kate', 'Leo', 'Mia', 'Noah', 'Olivia', 'Paul',
    'Quinn', 'Rose', 'Sam', 'Tina', 'Uma', 'Vic', 'Wendy', 'Xavier',
    'Yara', 'Zoe', 'Alex', 'Ben', 'Cam', 'Dan', 'Eli', 'Finn',
    'Gabe', 'Hal', 'Ian', 'Jay', 'Kim', 'Lou', 'Max', 'Nat',
    'Owen', 'Pat', 'Ray', 'Sue', 'Tom', 'Val', 'Will', 'Zara'
];

const jobOptions: Record<TraitName, string[]> = {
    Town: ['Mayor', 'Citizen', 'Urban', 'Speaker'],
    Economy: ['Banker', 'Merchant', 'Trader', 'Broker'],
    Defense: ['Guard', 'Shield', 'Knight', 'Sentinel'],
    Attack: ['Raider', 'Warrior', 'Fighter', 'Ravager'],
    Expansion: ['Explorer', 'Pioneer', 'Settler', 'Scout'],
    Aura: ['Leader', 'Beacon', 'Guide', 'Influencer']
};

const farmJobs = ['Farmer', 'Grower', 'Harvester', 'Planter'];

const getWeight = (weights: Partial<AIWeights> | undefined, key: keyof AIWeights): number => {
    return weights?.[key] ?? DefaultAIWeights[key];
};

const calcTraitScores = (profile: AIProfile): TraitScores => {
    const weights = profile.weights || {};
    const economyScore = (
        getWeight(weights, 'ECONOMY_BASE_INCOME') / DefaultAIWeights.ECONOMY_BASE_INCOME +
        getWeight(weights, 'ECONOMY_FARM_BUILD') / DefaultAIWeights.ECONOMY_FARM_BUILD
    ) / 2;
    const defenseScore = (
        getWeight(weights, 'DEFENSE_WALL_BUILD') / DefaultAIWeights.DEFENSE_WALL_BUILD +
        getWeight(weights, 'DEFENSE_WALL_UPGRADE') / DefaultAIWeights.DEFENSE_WALL_UPGRADE
    ) / 2;
    const attackScore = getWeight(weights, 'SCORE_ENEMY_LAND') / DefaultAIWeights.SCORE_ENEMY_LAND;
    const expansionScore = getWeight(weights, 'SCORE_EXPANSION') / DefaultAIWeights.SCORE_EXPANSION;
    const townScore = getWeight(weights, 'SCORE_TOWN') / DefaultAIWeights.SCORE_TOWN;
    const auraScore = getWeight(weights, 'SCORE_AURA_MULTIPLIER') / DefaultAIWeights.SCORE_AURA_MULTIPLIER;
    const hasFarm = getWeight(weights, 'ECONOMY_FARM_BUILD') > DefaultAIWeights.ECONOMY_FARM_BUILD * 1.2
        || getWeight(weights, 'ECONOMY_FARM_UPGRADE') > DefaultAIWeights.ECONOMY_FARM_UPGRADE * 1.2;

    return {
        scores: {
            Economy: economyScore,
            Defense: defenseScore,
            Attack: attackScore,
            Expansion: expansionScore,
            Town: townScore,
            Aura: auraScore
        },
        hasFarm
    };
};

const calcRelativeScores = (profiles: AIProfile[]) => {
    const perProfile = new Map<string, TraitScores>();
    const totals: Record<TraitName, number[]> = {
        Economy: [],
        Defense: [],
        Attack: [],
        Expansion: [],
        Town: [],
        Aura: []
    };

    for (const profile of profiles) {
        const data = calcTraitScores(profile);
        perProfile.set(profile.id, data);
        for (const trait of TRAITS) {
            totals[trait].push(data.scores[trait]);
        }
    }

    const stats: Record<TraitName, { mean: number; std: number }> = {
        Economy: { mean: 0, std: 0 },
        Defense: { mean: 0, std: 0 },
        Attack: { mean: 0, std: 0 },
        Expansion: { mean: 0, std: 0 },
        Town: { mean: 0, std: 0 },
        Aura: { mean: 0, std: 0 }
    };

    for (const trait of TRAITS) {
        const values = totals[trait];
        const mean = values.reduce((sum, v) => sum + v, 0) / Math.max(values.length, 1);
        const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / Math.max(values.length, 1);
        const std = Math.sqrt(variance);
        stats[trait] = { mean, std };
    }

    return { perProfile, stats };
};

const hashString = (value: string): number => {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
        hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
    }
    return hash;
};

const pickLabel = (profile: AIProfile, trait: TraitName, hasFarm: boolean, usedLabels: Set<string>) => {
    const idSeed = `${profile.id}:${trait}`;
    const idHash = hashString(idSeed);
    const jobs = trait === 'Economy' && hasFarm ? farmJobs : jobOptions[trait];
    let jobIndex = idHash % jobs.length;
    let nameIndex = idHash % firstNames.length;

    const maxAttempts = jobs.length * firstNames.length;
    for (let attempts = 0; attempts < maxAttempts; attempts++) {
        const job = jobs[jobIndex];
        const name = firstNames[nameIndex];
        const candidate = `${job} ${name}`;
        if (!usedLabels.has(candidate)) {
            return candidate;
        }
        nameIndex = (nameIndex + 1) % firstNames.length;
        if (nameIndex === 0) {
            jobIndex = (jobIndex + 1) % jobs.length;
        }
    }

    return `${jobs[0]} ${firstNames[0]}`;
};

export const assignProfileLabels = (profiles: AIProfile[], options: LabelOptions = {}) => {
    const usedLabels = options.existingLabels ?? new Set<string>();
    const { perProfile, stats } = calcRelativeScores(profiles);
    const usedTraits = new Set<TraitName>();

    const relativeScores = profiles.map((profile) => {
        const data = perProfile.get(profile.id);
        if (!data) {
            return { profile, hasFarm: false, traitScores: [] as { trait: TraitName; score: number }[], max: 0 };
        }
        const traitScores = TRAITS.map((trait) => {
            const { mean, std } = stats[trait];
            const score = std > 1e-6 ? (data.scores[trait] - mean) / std : 0;
            return { trait, score };
        }).sort((a, b) => b.score - a.score);
        const max = traitScores.length ? traitScores[0].score : 0;
        return { profile, hasFarm: data.hasFarm, traitScores, max };
    });

    relativeScores.sort((a, b) => b.max - a.max);

    for (const entry of relativeScores) {
        const { profile, hasFarm, traitScores } = entry;
        let chosen = traitScores.find((t) => !usedTraits.has(t.trait))?.trait;
        if (!chosen) {
            chosen = traitScores[0]?.trait ?? 'Economy';
        }
        usedTraits.add(chosen);
        const label = pickLabel(profile, chosen, hasFarm, usedLabels);
        profile.label = label;
        usedLabels.add(label);
    }
};
