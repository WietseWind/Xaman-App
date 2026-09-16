export const cameraTorchState = (enabled: boolean, hasTorch: boolean): 'on' | 'off' => {
    return enabled && hasTorch ? 'on' : 'off';
};
