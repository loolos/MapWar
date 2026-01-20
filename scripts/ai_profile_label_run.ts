import { assignProfileLabels } from './ai_profile_label';
import { writeEvolvedProfilesToSource } from './ai_profile_writer';
import {
    EvolvedProfile1,
    EvolvedProfile2,
    EvolvedProfile3,
    EvolvedProfile4,
    type AIProfile
} from '../src/core/ai/AIProfile';

const profiles: AIProfile[] = [
    EvolvedProfile1,
    EvolvedProfile2,
    EvolvedProfile3,
    EvolvedProfile4
].filter(Boolean) as AIProfile[];

if (profiles.length === 0) {
    console.error('No EvolvedProfile1-4 found to relabel.');
    process.exit(1);
}

assignProfileLabels(profiles);
writeEvolvedProfilesToSource(profiles);
