package com.hutchy9999.shiftprofit;

/** Local, deterministic pickup-stop inference. A stop is not food-ready time. */
public final class StopDetector {
    public static final class Target {
        public final String jobId;
        public final double lat, lng;
        public final boolean precise;
        public Target(String jobId, double lat, double lng, boolean precise) {
            this.jobId=jobId; this.lat=lat; this.lng=lng; this.precise=precise;
        }
    }
    public static final class Stop {
        public final long arrival, departure;
        public final double lat,lng,accuracy,minutes;
        public final int samples;
        public final boolean eligible;
        Stop(long arrival,long departure,double lat,double lng,double accuracy,int samples,boolean eligible) {
            this.arrival=arrival;this.departure=departure;this.lat=lat;this.lng=lng;
            this.accuracy=accuracy;this.samples=samples;this.eligible=eligible;
            this.minutes=(departure-arrival)/60000.0;
        }
    }
    private static final double STOP_RADIUS_METRES = 40;
    private static final double MAX_STOP_SPEED = 1.5; // metres per second
    private static final double MAX_STOP_ACCURACY = 35;

    private final Target target;
    private long arrival, last, lastStationary, firstMoving;
    private double anchorLat, anchorLng, sumLat, sumLng, worstAccuracy;
    private int samples;
    private boolean completed;
    public String status = "pickup_approaching";

    public StopDetector(Target target) { this.target = target; }

    public Stop accept(long at,double lat,double lng,double accuracy,double speed) {
        if(completed||!Double.isFinite(lat)||!Double.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180||!Double.isFinite(accuracy)||!Double.isFinite(speed)||accuracy<0||accuracy>50||at<=last)return null;
        if (last > 0 && at - last > 120000) {
            resetCandidate();
            status = "pickup_reset_gap";
        }
        last = at;

        boolean slow = speed <= MAX_STOP_SPEED;
        if (arrival != 0) {
            // Measure dwell around the first stationary fix, not the entire pickup area.
            if (slow && metres(anchorLat, anchorLng, lat, lng) <= STOP_RADIUS_METRES) {
                firstMoving = 0;
                recordStationaryFix(at, lat, lng, accuracy);
                return null;
            }
            if (firstMoving == 0) {
                firstMoving = at;
                return null;
            }
            // A second moving fix confirms departure. Only observed dwell qualifies the stop.
            long minimumDwell = target.precise ? 60000 : 300000;
            if (samples >= 3 && worstAccuracy <= MAX_STOP_ACCURACY
                    && lastStationary - arrival >= minimumDwell && firstMoving - arrival <= 5400000) {
                completed = true;
                status = "pickup_estimated";
                return new Stop(arrival, firstMoving, sumLat / samples, sumLng / samples, worstAccuracy, samples, true);
            }
            resetCandidate();
            status = "pickup_uncertain";
        }

        double pickupRadius = target.precise ? 100 : 180;
        if (slow && accuracy <= MAX_STOP_ACCURACY && metres(target.lat, target.lng, lat, lng) <= pickupRadius) {
            arrival = at;
            anchorLat = lat;
            anchorLng = lng;
            status = "pickup_candidate";
            recordStationaryFix(at, lat, lng, accuracy);
        }
        return null;
    }

    private void recordStationaryFix(long at, double lat, double lng, double accuracy) {
        lastStationary = at;
        sumLat += lat;
        sumLng += lng;
        worstAccuracy = Math.max(worstAccuracy, accuracy);
        samples++;
    }

    private void resetCandidate() {
        arrival = 0;
        lastStationary = 0;
        firstMoving = 0;
        samples = 0;
        sumLat = 0;
        sumLng = 0;
        worstAccuracy = 0;
    }
    public static double metres(double a,double b,double c,double d) {
        double la=Math.toRadians(c-a),lo=Math.toRadians(d-b);
        double h=Math.sin(la/2)*Math.sin(la/2)+Math.cos(Math.toRadians(a))*Math.cos(Math.toRadians(c))*Math.sin(lo/2)*Math.sin(lo/2);
        return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
    }
}
