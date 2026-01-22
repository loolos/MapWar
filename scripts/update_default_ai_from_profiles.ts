import fs from 'node:fs';
import path from 'path';
import type { AIProfile, AIWeights } from '../src/core/ai/AIProfile';
import { DefaultAIWeights } from '../src/core/ai/AIProfile';

// Import all profiles dynamically
const sourcePath = path.join(process.cwd(), 'src', 'core', 'ai', 'AIProfile.ts');
const source = fs.readFileSync(sourcePath, 'utf-8');

// Extract all profile definitions using regex
const profileRegex = /export const (EvolvedProfile\d+|RandomAiProfiles): AIProfile(?:\[\])? = \{([\s\S]*?)\};/g;
const profiles: AIProfile[] = [];

// First, extract individual EvolvedProfile definitions
const evolvedProfileRegex = /export const EvolvedProfile\d+: AIProfile = \{([\s\S]*?)\};/g;
let match;
while ((match = evolvedProfileRegex.exec(source)) !== null) {
    try {
        // Parse the profile object
        const profileStr = match[0];
        // Extract id, label, and weights
        const idMatch = profileStr.match(/id:\s*['"]([^'"]+)['"]/);
        const labelMatch = profileStr.match(/label:\s*['"]([^'"]+)['"]/);
        const weightsMatch = profileStr.match(/weights:\s*\{([\s\S]*?)\n\s*\}/);
        
        if (idMatch) {
            const weights: Partial<AIWeights> = {};
            if (weightsMatch) {
                const weightsStr = weightsMatch[1];
                // Extract each weight key-value pair
                const weightRegex = /(\w+):\s*([\d.]+)/g;
                let weightMatch;
                while ((weightMatch = weightRegex.exec(weightsStr)) !== null) {
                    const key = weightMatch[1] as keyof AIWeights;
                    const value = parseFloat(weightMatch[2]);
                    if (!isNaN(value)) {
                        weights[key] = value;
                    }
                }
            }
            
            profiles.push({
                id: idMatch[1],
                label: labelMatch ? labelMatch[1] : undefined,
                weights
            });
        }
    } catch (e) {
        console.warn(`Failed to parse profile: ${e}`);
    }
}

if (profiles.length === 0) {
    console.error('No profiles found in AIProfile.ts');
    process.exit(1);
}

console.log(`Found ${profiles.length} profiles`);

// Calculate averages for each weight key
const allKeys = Object.keys(DefaultAIWeights) as (keyof AIWeights)[];
const averages: Partial<AIWeights> = {};

for (const key of allKeys) {
    const values: number[] = [];
    for (const profile of profiles) {
        const value = profile.weights?.[key];
        if (value !== undefined && !isNaN(value)) {
            values.push(value);
        } else {
            // Use default value if missing
            values.push(DefaultAIWeights[key]);
        }
    }
    
    if (values.length > 0) {
        const sum = values.reduce((a, b) => a + b, 0);
        const avg = sum / values.length;
        // Round to 3 decimal places
        averages[key] = Math.round(avg * 1000) / 1000;
    }
}

// Generate the new DefaultAIWeights definition
const formatWeightsBlock = (weights: Partial<AIWeights>, indent: string = '    ') => {
    const sortedKeys = Object.keys(weights).sort() as (keyof AIWeights)[];
    const lines = sortedKeys.map((key) => {
        const value = weights[key]!;
        return `${indent}${key}: ${value},`;
    });
    return lines.join('\n');
};

// Update the source file
const weightsBlock = formatWeightsBlock(averages as AIWeights);
const newDefaultWeights = `export const DefaultAIWeights: AIWeights = {\n${weightsBlock}\n};`;

// Replace the DefaultAIWeights definition
const defaultWeightsRegex = /export const DefaultAIWeights: AIWeights = \{[\s\S]*?\};/;
if (!defaultWeightsRegex.test(source)) {
    console.error('Could not find DefaultAIWeights definition');
    process.exit(1);
}

const updatedSource = source.replace(defaultWeightsRegex, newDefaultWeights);

fs.writeFileSync(sourcePath, updatedSource, 'utf-8');

console.log('✅ Updated DefaultAIWeights with averages from all profiles:');
console.log(`   Profiles used: ${profiles.length}`);
console.log(`   Average values calculated for ${Object.keys(averages).length} weights`);
