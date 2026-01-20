import fs from 'node:fs';
import path from 'path';
import type { AIProfile, AIWeights } from '../src/core/ai/AIProfile';

const formatWeightsBlock = (weights: Partial<AIWeights>, indent: string = '        ') => {
    const sortedKeys = Object.keys(weights).sort() as (keyof AIWeights)[];
    const lines = sortedKeys.map((key) => {
        const value = weights[key]!;
        return `${indent}${key}: ${value},`;
    });
    return lines.join('\n');
};

export const writeEvolvedProfilesToSource = (profiles: AIProfile[]) => {
    const sourcePath = path.join(process.cwd(), 'src', 'core', 'ai', 'AIProfile.ts');
    let source = fs.readFileSync(sourcePath, 'utf-8');

    // Remove existing EvolvedProfile definitions (CRLF-safe)
    source = source.replace(/export const EvolvedProfile\d+: AIProfile = \{[\s\S]*?\};\s*/g, '');

    // Ensure RandomAiProfiles declaration is correct
    source = source.replace(/export const RandomAiProfiles: AIProfile\[[\s\S]*?\];/g, (match) => {
        return match.replace('AIProfile[', 'AIProfile[] = [');
    });

    // Find RandomAiProfiles array
    const startMarker = 'export const RandomAiProfiles: AIProfile[] = [';
    const startIndex = source.indexOf(startMarker);
    if (startIndex === -1) {
        throw new Error('Could not find RandomAiProfiles array in source file');
    }
    const afterStart = source.indexOf('\n', startIndex);
    const endIndex = source.indexOf('];', afterStart);
    if (endIndex === -1) {
        throw new Error('Could not find end of RandomAiProfiles array');
    }

    // Extract existing entries, removing any stale EvolvedProfile references
    const existingArrayContent = source.substring(afterStart + 1, endIndex)
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith('EvolvedProfile'))
        .map((line) => line.replace(/,?$/, ''))
        .join(',\n');

    // Generate new profile definitions
    const profileDefs = profiles.map((profile, index) => {
        const varName = `EvolvedProfile${index + 1}`;
        const weightsBlock = formatWeightsBlock(profile.weights || {});
        return `export const ${varName}: AIProfile = {\n    id: '${profile.id}',\n    label: '${profile.label}',\n    weights: {\n${weightsBlock}\n    }\n};`;
    }).join('\n\n');

    // Generate new array entries
    const newArrayEntries = profiles.map((_, index) => `    EvolvedProfile${index + 1}`).join(',\n');

    const newArrayContent = existingArrayContent
        ? `${existingArrayContent},\n${newArrayEntries}`
        : newArrayEntries;

    const before = source.substring(0, startIndex);
    const after = source.substring(endIndex + 2);

    const updatedArray = `${startMarker}\n${newArrayContent}\n];`;

    const finalSource = before + profileDefs + '\n\n' + updatedArray + after;

    fs.writeFileSync(sourcePath, finalSource, 'utf-8');
    console.log(`✅ Written ${profiles.length} evolved profiles to ${sourcePath}`);
};
