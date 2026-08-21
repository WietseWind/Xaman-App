package libs.security.providers;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import com.facebook.react.bridge.ReactApplicationContext;

import org.junit.Assert;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.util.List;

import libs.security.crypto.Crypto;

@RunWith(AndroidJUnit4.class)
public class UniqueIdProviderTest {
    @Before
    public void setUp() {
        UniqueIdProvider.sharedInstance().init(
                new ReactApplicationContext(
                        InstrumentationRegistry.getInstrumentation().getTargetContext()
                )
        );
    }

    @Test
    public void toDeviceIdBytesPadsLeadingZeros() {
        byte[] padded = UniqueIdProvider.toDeviceIdBytes("aabbccddeeff001");
        byte[] full = UniqueIdProvider.toDeviceIdBytes("0aabbccddeeff001");

        Assert.assertNotNull(padded);
        Assert.assertEquals(8, padded.length);
        Assert.assertArrayEquals(full, padded);
        Assert.assertNull(UniqueIdProvider.toDeviceIdBytes("android_id"));
        Assert.assertNull(UniqueIdProvider.toDeviceIdBytes("not-hex"));
    }

    @Test
    public void persistConfirmedWritesLastKnownAndCandidatesIncludeIt() {
        UniqueIdProvider provider = UniqueIdProvider.sharedInstance();
        String deviceId = provider.getDeviceUniqueId();
        Assert.assertNotNull(deviceId);

        provider.persistConfirmedDeviceUniqueId(deviceId);

        Assert.assertEquals(deviceId, provider.loadLastKnownAndroidId());

        List<String> candidates = provider.getDecryptCandidateIds();
        Assert.assertFalse(candidates.isEmpty());

        boolean found = false;
        for (String candidate : candidates) {
            byte[] candidateBytes = UniqueIdProvider.toDeviceIdBytes(candidate);
            byte[] deviceBytes = UniqueIdProvider.toDeviceIdBytes(deviceId);
            if (java.util.Arrays.equals(candidateBytes, deviceBytes)) {
                found = true;
                break;
            }
        }
        Assert.assertTrue(found);
    }

    @Test
    public void lastKnownDeviceIdChangedOnlyWhenStoredAndLiveDiffer() {
        UniqueIdProvider provider = UniqueIdProvider.sharedInstance();
        String liveId = provider.getDeviceUniqueId();
        Assert.assertNotNull(liveId);

        provider.persistConfirmedDeviceUniqueId(liveId);
        Assert.assertFalse(provider.isLastKnownDeviceIdChanged());

        String previous = provider.loadLastKnownAndroidId();
        try {
            provider.saveLastKnownAndroidId("ffffffffffffffff");
            Assert.assertTrue(provider.isLastKnownDeviceIdChanged());
        } finally {
            provider.saveLastKnownAndroidId(previous);
        }
        Assert.assertFalse(provider.isLastKnownDeviceIdChanged());
    }

    @Test
    public void decryptCandidatesDedupeByPaddedBytes() {
        UniqueIdProvider provider = UniqueIdProvider.sharedInstance();
        String deviceId = provider.getDeviceUniqueId();
        Assert.assertNotNull(deviceId);

        provider.persistConfirmedDeviceUniqueId(deviceId);

        List<String> candidates = provider.getDecryptCandidateIds();
        java.util.HashSet<String> bytesHex = new java.util.HashSet<>();
        for (String candidate : candidates) {
            byte[] bytes = UniqueIdProvider.toDeviceIdBytes(candidate);
            Assert.assertNotNull(bytes);
            Assert.assertTrue(bytesHex.add(Crypto.BytesToHex(bytes)));
        }
    }
}
