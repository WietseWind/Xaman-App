/**
 * Says a message to screen readers when it appears (e.g. the outcome of a transaction).
 * Renders nothing, so nothing changes on screen.
 *
 * Never pass a secret: on Android every accessibility service receives announcements.
 */
import { useEffect } from 'react';
import { AccessibilityInfo } from 'react-native';

interface Props {
    message: string;
    // give a screen change time to settle, so the announcement isn't cut off
    delay?: number;
}

const ScreenReaderAnnouncement = ({ message, delay = 500 }: Props) => {
    useEffect(() => {
        const timeout = setTimeout(() => AccessibilityInfo.announceForAccessibility(message), delay);
        return () => clearTimeout(timeout);
    }, [message, delay]);

    return null;
};

export default ScreenReaderAnnouncement;
