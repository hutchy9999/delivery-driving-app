package com.hutchy9999.shiftprofit;
import org.junit.Test;
import static org.junit.Assert.*;

public class StopDetectorTest {
    private final long start=1800000000000L;
    private StopDetector detector(boolean precise){return new StopDetector(new StopDetector.Target("job",53.48,-2.25,precise));}
    @Test public void longStopCountsFromArrivalNotMinuteFive(){
        StopDetector d=detector(false);
        for(int i=0;i<=36;i++)assertNull(d.accept(start+i*10000,53.48,-2.25,15,0));
        assertNull(d.accept(start+370000,53.484,-2.25,15,8));
        StopDetector.Stop s=d.accept(start+380000,53.485,-2.25,15,8);
        assertNotNull(s);assertEquals(start,s.arrival);assertEquals(370000/60000.0,s.minutes,0.001);assertTrue(s.eligible);
        assertNull(d.accept(start+390000,53.486,-2.25,15,10));
    }
    @Test public void preciseShortCollectionCanCount(){
        StopDetector d=detector(true);
        d.accept(start,53.48,-2.25,12,0);d.accept(start+40000,53.48,-2.25,12,0);d.accept(start+80000,53.48,-2.25,12,0);
        d.accept(start+90000,53.484,-2.25,12,8);assertTrue(d.accept(start+100000,53.485,-2.25,12,8).eligible);
    }
    @Test public void trafficPassingNearbyDoesNotStartStop(){
        StopDetector d=detector(false);
        d.accept(start,53.48,-2.25,10,12);d.accept(start+10000,53.48,-2.25,10,10);
        d.accept(start+20000,53.484,-2.25,10,10);assertNull(d.accept(start+30000,53.485,-2.25,10,10));
    }
    @Test public void missingGpsDoesNotBecomeAWait(){
        StopDetector d=detector(true);
        d.accept(start,53.48,-2.25,10,0);d.accept(start+600000,53.48,-2.25,10,0);
        d.accept(start+610000,53.484,-2.25,10,10);assertNull(d.accept(start+620000,53.485,-2.25,10,10));
    }
    @Test public void inaccurateFixIsIgnored(){assertNull(detector(true).accept(start,53.48,-2.25,200,0));}

    @Test public void drivingInsidePickupAreaDoesNotAccumulateWait() {
        StopDetector d = detector(false);
        d.accept(start, 53.48, -2.25, 15, 0);
        for (int i = 1; i <= 36; i++) {
            assertNull(d.accept(start + i * 10000L, 53.4805, -2.25, 15, 8));
        }
        assertNull(d.accept(start + 370000, 53.484, -2.25, 15, 8));
        assertNull(d.accept(start + 380000, 53.485, -2.25, 15, 8));
    }

    @Test public void positionDriftAcrossPickupAreaDoesNotAccumulateWaitWithoutSpeed() {
        StopDetector d = detector(false);
        for (int i = 0; i <= 36; i++) {
            assertNull(d.accept(start + i * 10000L, 53.479 + i * 0.00007, -2.25, 10, 0));
        }
        assertNull(d.accept(start + 370000, 53.484, -2.25, 10, 8));
        assertNull(d.accept(start + 380000, 53.485, -2.25, 10, 8));
    }

    @Test public void shortStopDoesNotPreventLaterCollection() {
        assertLaterCollection(false);
    }

    @Test public void uncertainStopDoesNotPreventLaterCollection() {
        assertLaterCollection(true);
    }

    private void assertLaterCollection(boolean uncertain) {
        StopDetector d = detector(false);
        int firstStopSamples = uncertain ? 37 : 12;
        for (int i = 0; i < firstStopSamples; i++) {
            d.accept(start + i * 10000L, 53.48, -2.25, uncertain && i == 2 ? 40 : 15, 0);
        }
        long firstDeparture = start + firstStopSamples * 10000L;
        assertNull(d.accept(firstDeparture, 53.484, -2.25, 15, 8));
        assertNull(d.accept(firstDeparture + 10000, 53.485, -2.25, 15, 8));

        long arrival = firstDeparture + 30000;
        for (int i = 0; i <= 36; i++) {
            assertNull(d.accept(arrival + i * 10000L, 53.48, -2.25, 15, 0));
        }
        // Driving away from the stop can be confirmed inside the pickup area.
        assertNull(d.accept(arrival + 370000, 53.4805, -2.25, 15, 8));
        StopDetector.Stop stop = d.accept(arrival + 380000, 53.481, -2.25, 15, 8);
        assertNotNull(stop);
        assertTrue(stop.eligible);
        assertEquals(arrival, stop.arrival);
        assertEquals(arrival + 370000, stop.departure);
    }
}
