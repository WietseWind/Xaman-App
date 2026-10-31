const fs = jest.requireActual('fs') as typeof import('fs');
const os = jest.requireActual('os') as typeof import('os');
const path = jest.requireActual('path') as typeof import('path');
const { execFileSync } = jest.requireActual('child_process') as typeof import('child_process');

const sessionPath = path.join(
    __dirname,
    '../../../../../node_modules/react-native-vision-camera/ios/Core/CameraSession.swift',
);

const decisionSource = (swift: string): string => {
    const begin = '// preview-restart-decision:begin';
    const end = '// preview-restart-decision:end';
    const start = swift.indexOf(begin);
    const stop = swift.indexOf(end);
    if (start < 0 || stop < 0) {
        throw new Error('previewRestartDecision is not in CameraSession.swift');
    }
    return swift.slice(start + begin.length, stop).trim();
};

const runDecision = (swift: string): string => {
    const program = `${decisionSource(swift)}
func show(_ action: PreviewRestartDecision) {
  switch action {
  case .reportStopped: print("report-stopped")
  case .resumed: print("resumed")
  case .leave: print("leave")
  }
}
show(previewRestartDecision(sessionActive: true, sessionRunning: false))
show(previewRestartDecision(sessionActive: true, sessionRunning: true))
show(previewRestartDecision(sessionActive: false, sessionRunning: false))
`;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'preview-restart-'));
    const file = path.join(dir, 'decision.swift');
    fs.writeFileSync(file, program);
    return execFileSync('xcrun', ['swift', file], { encoding: 'utf8' }).trim();
};

describe('previewRestartDecision', () => {
    const swift = fs.readFileSync(sessionPath, 'utf8');

    it('reports a restart that leaves the active session stopped', () => {
        const [failedRestart, resumed, inactive] = runDecision(swift).split('\n');
        expect(failedRestart).toBe('report-stopped');
        expect(resumed).toBe('resumed');
        expect(inactive).toBe('leave');
        expect(swift.split('previewRestartDecision(').length - 1).toBe(3);
    });
});
