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
    private final Target target;
    private long arrival=0,last=0,lastInside=0,firstOutside=0;
    private double sumLat=0,sumLng=0,worstAccuracy=0;
    private int samples=0,outside=0;
    private boolean completed=false;
    public String status="pickup_approaching";
    public StopDetector(Target target) { this.target=target; }
    public Stop accept(long at,double lat,double lng,double accuracy,double speed) {
        if(completed||!Double.isFinite(lat)||!Double.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180||!Double.isFinite(accuracy)||!Double.isFinite(speed)||accuracy<0||accuracy>50||at<=last)return null;
        if(last>0&&at-last>120000){resetCandidate();status="pickup_reset_gap";} // Never invent a stop across missing tracking.
        last=at;
        double radius=target.precise?100:180;
        double distance=metres(lat,lng,target.lat,target.lng);
        if(distance<=radius) {
            outside=0;firstOutside=0;
            if(arrival==0) {
                if(speed>2.5||accuracy>35)return null;
                arrival=at;
                status="pickup_candidate";
            }
            lastInside=at;sumLat+=lat;sumLng+=lng;worstAccuracy=Math.max(worstAccuracy,accuracy);samples++;
            return null;
        }
        if(arrival==0||distance<radius+50)return null;
        if(outside++==0)firstOutside=at;
        if(outside<2)return null;
        long end=firstOutside;
        double minutes=(end-arrival)/60000.0;
        if(minutes<0.5||minutes>90||samples<2) {resetCandidate();status="pickup_rejected_duration";return null;}
        boolean eligible=worstAccuracy<=35&&samples>=3&&minutes>=(target.precise?1:5);
        Stop stop=new Stop(arrival,end,sumLat/samples,sumLng/samples,worstAccuracy,samples,eligible);
        completed=true;status=eligible?"pickup_estimated":"pickup_uncertain";return stop;
    }
    private void resetCandidate() {arrival=0;lastInside=0;firstOutside=0;samples=0;outside=0;sumLat=0;sumLng=0;worstAccuracy=0;}
    public static double metres(double a,double b,double c,double d) {
        double la=Math.toRadians(c-a),lo=Math.toRadians(d-b);
        double h=Math.sin(la/2)*Math.sin(la/2)+Math.cos(Math.toRadians(a))*Math.cos(Math.toRadians(c))*Math.sin(lo/2)*Math.sin(lo/2);
        return 6371000*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
    }
}
