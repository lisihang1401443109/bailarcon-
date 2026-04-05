export const sampleBeatmap = {
    metadata: {
        title: "Neon Dance",
        artist: "Digital Spirit",
        difficulty: "Hard"
    },
    objects: [
        // Intro (0-5s) - Hand and Foot
        { id: 1, type: 'circle', time: 500, x: 200, y: 300, target: 'HAND' },
        { id: 2, type: 'circle', time: 1000, x: 800, y: 300, target: 'HAND' },
        { id: 3, type: 'circle', time: 1500, x: 200, y: 700, target: 'FOOT' },
        { id: 4, type: 'circle', time: 2000, x: 800, y: 700, target: 'FOOT' },
        { id: 5, type: 'circle', time: 2300, x: 500, y: 200, target: 'HAND' },
        { id: 6, type: 'circle', time: 2600, x: 500, y: 800, target: 'FOOT' },

        // Rapid stream (3-5s)
        { id: 7, type: 'circle', time: 3000, x: 200, y: 500, target: 'HAND' },
        { id: 8, type: 'circle', time: 3300, x: 350, y: 500, target: 'HAND' },
        { id: 9, type: 'circle', time: 3600, x: 500, y: 500, target: 'HAND' },
        { id: 10, type: 'circle', time: 3900, x: 650, y: 500, target: 'HAND' },
        { id: 11, type: 'circle', time: 4200, x: 800, y: 500, target: 'HAND' },

        // Sliders (5-8s)
        {
            id: 12, type: 'slider', time: 5000, duration: 1500, target: 'HAND',
            points: [
                { x: 200, y: 200 }, { x: 500, y: 400 }, { x: 800, y: 200 }
            ]
        },
        {
            id: 13, type: 'slider', time: 7000, duration: 1500, target: 'FOOT',
            points: [
                { x: 800, y: 800 }, { x: 500, y: 600 }, { x: 200, y: 800 }
            ]
        },

        // Crossovers (8-12s)
        { id: 14, type: 'circle', time: 9000, x: 100, y: 100, target: 'HAND' },
        { id: 15, type: 'circle', time: 9200, x: 900, y: 900, target: 'FOOT' },
        { id: 16, type: 'circle', time: 9400, x: 100, y: 900, target: 'FOOT' },
        { id: 17, type: 'circle', time: 9600, x: 900, y: 100, target: 'HAND' },
        { id: 18, type: 'circle', time: 10000, x: 500, y: 500, target: 'HAND' }
    ]
};

export const tutorialObjects = [
    { id: 1, type: 'circle', time: 2000, x: 500, y: 300, target: 'HAND' },
    { id: 2, type: 'circle', time: 4000, x: 200, y: 500, target: 'HAND' },
    { id: 3, type: 'circle', time: 6000, x: 800, y: 500, target: 'HAND' },
    {
        id: 4, type: 'slider', time: 8000, duration: 3000, target: 'HAND',
        points: [{ x: 500, y: 200 }, { x: 500, y: 800 }]
    }
];

export const maps = [
    { id: 'tutorial', title: "TUTORIAL", artist: "BailarCon", difficulty: "EASY", bpm: 80, objects: tutorialObjects },
    { id: 'neon', title: "NEON DANCE", artist: "Digital Spirit", difficulty: "HARD", bpm: 128, objects: sampleBeatmap.objects },
    { id: 'zenith', title: "ZENITH REACH", artist: "Cyber Dream", difficulty: "INSANE", bpm: 160, objects: sampleBeatmap.objects },
    { id: 'pulse', title: "PULSE WAVE", artist: "Neon Heart", difficulty: "EXPERT", bpm: 145, objects: sampleBeatmap.objects },
    { id: 'electro', title: "ELECTRO SHOCK", artist: "Volt Rider", difficulty: "NORMAL", bpm: 110, objects: sampleBeatmap.objects }
];
