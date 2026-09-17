describe('LaunchActivity window background on global layout', () => {
    it('reproduces allocating a new drawable on every layout when the color is unchanged', () => {
        let allocations = 0;
        const setBackground = (_color: number) => {
            allocations += 1;
        };

        const background = 0xff112233;
        setBackground(background);
        setBackground(background);
        setBackground(background);
        expect(allocations).toBe(3);
    });

    it('only allocates when the color changes', () => {
        let allocations = 0;
        let last = 0;
        const setBackgroundIfChanged = (color: number) => {
            if (color !== last) {
                last = color;
                allocations += 1;
            }
        };

        const background = 0xff112233;
        setBackgroundIfChanged(background);
        setBackgroundIfChanged(background);
        setBackgroundIfChanged(background);
        expect(allocations).toBe(1);
    });
});
