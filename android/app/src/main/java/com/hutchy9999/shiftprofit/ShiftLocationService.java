package com.hutchy9999.shiftprofit;

import android.Manifest;
import android.app.*;
import android.content.*;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.location.*;
import android.os.*;
import androidx.core.app.NotificationCompat;
import org.json.JSONObject;

/** User-started location foreground service; never uploads a trace. */
public final class ShiftLocationService extends Service implements LocationListener {
    public static volatile boolean running=false;
    public static final String STOP="com.hutchy9999.shiftprofit.STOP_TRACKING";
    private static final int NOTIFICATION=42;
    private TrackingStore store;
    private LocationManager manager;
    private HandlerThread thread;
    private Handler worker;
    private String shift="",detectorJob="";
    private StopDetector detector;
    private long lastAt=0;
    private double lastLat=0,lastLng=0,lastAccuracy=0;
    private long logAt=0;
    private int acceptedFixes=0,rejectedFixes=0;
    private double bestAccuracy=50;
    private String detectorStatus="";
    @Override public void onCreate(){super.onCreate();store=TrackingStore.get(this);manager=(LocationManager)getSystemService(LOCATION_SERVICE);thread=new HandlerThread("ShiftGps");thread.start();worker=new Handler(thread.getLooper());}
    @Override public int onStartCommand(Intent intent,int flags,int startId){
        if(intent!=null&&STOP.equals(intent.getAction())){store.diagnostic("notification_pause",null);store.put("paused","true");store.put("reason","Paused from tracking notification");stopSelf();return START_NOT_STICKY;}
        shift=store.text("shift","");
        if(shift.isEmpty()||store.text("paused","false").equals("true")){stopSelf();return START_NOT_STICKY;}
        if(checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)!=PackageManager.PERMISSION_GRANTED){store.put("reason","Precise location permission is needed");stopSelf();return START_NOT_STICKY;}
        try{
            NotificationChannel channel=new NotificationChannel("shift-gps","Shift location tracking",NotificationManager.IMPORTANCE_LOW);
            getSystemService(NotificationManager.class).createNotificationChannel(channel);
            Intent open=new Intent(this,MainActivity.class);
            PendingIntent launch=PendingIntent.getActivity(this,0,open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
            PendingIntent pause=PendingIntent.getService(this,1,new Intent(this,ShiftLocationService.class).setAction(STOP),PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
            Notification note=new NotificationCompat.Builder(this,"shift-gps").setSmallIcon(android.R.drawable.ic_menu_mylocation).setContentTitle("Shift Profit · GPS recording").setContentText("Recording this shift locally. Tap to open.").setContentIntent(launch).setOngoing(true).addAction(0,"Pause tracking",pause).build();
            startForeground(NOTIFICATION,note,ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION);
            long previous=Long.parseLong(store.text("lastFix","0"));if(previous>0&&System.currentTimeMillis()-previous>120000)store.put("gaps",Integer.toString(Integer.parseInt(store.text("gaps","0"))+1));
            running=true;store.put("reason","");
            store.diagnostic("gps_service_start",null);
            String provider=Build.VERSION.SDK_INT>=31&&manager.hasProvider(LocationManager.FUSED_PROVIDER)?LocationManager.FUSED_PROVIDER:LocationManager.GPS_PROVIDER;
            if(Build.VERSION.SDK_INT>=31){LocationRequest request=new LocationRequest.Builder(10000).setQuality(LocationRequest.QUALITY_HIGH_ACCURACY).setMinUpdateIntervalMillis(5000).setMinUpdateDistanceMeters(0).build();manager.requestLocationUpdates(provider,request,r->worker.post(r),this);}
            else manager.requestLocationUpdates(provider,10000,0,this,thread.getLooper());
        }catch(Exception e){running=false;store.diagnostic("gps_service_start_failed",null);store.put("reason","Tracking could not start. Open the app and check location permissions/settings.");stopSelf();return START_NOT_STICKY;}
        return START_STICKY;
    }
    @Override public void onLocationChanged(Location location){
        try{handleLocation(location);}catch(Exception error){store.diagnostic("gps_processing_failed",null);}
    }
    private void handleLocation(Location location)throws Exception{
        if(!running)return;
        long now=System.currentTimeMillis(),at=location.getTime();double lat=location.getLatitude(),lng=location.getLongitude(),accuracy=location.getAccuracy(),speed=location.hasSpeed()?location.getSpeed():0;
        if(!Double.isFinite(lat)||!Double.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180||!Double.isFinite(accuracy)||!Double.isFinite(speed)||accuracy<0||accuracy>50||at<now-30000||at>now+1000||at<=lastAt){rejectedFixes++;logFixes(now);return;}
        double metres=0;
        if(lastAt>0){
            double seconds=(at-lastAt)/1000.0,distance=StopDetector.metres(lastLat,lastLng,lat,lng);
            if(distance/seconds>60){rejectedFixes++;logFixes(now);return;} // Reject implausible jumps, never treat GPS as an odometer.
            if(seconds>120){int gaps=Integer.parseInt(store.text("gaps","0"));store.put("gaps",Integer.toString(gaps+1));store.diagnostic("gps_long_gap",new JSONObject().put("ms",at-lastAt));}
            else if(distance>Math.max(5,(lastAccuracy+accuracy)*0.4))metres=distance;
        }
        JSONObject job=store.object("job");String jobId=job.optString("id","");
        store.point(shift,jobId,at,lat,lng,accuracy,speed,metres);store.put("lastFix",Long.toString(at));
        acceptedFixes++;bestAccuracy=Math.min(bestAccuracy,accuracy);logFixes(now);
        lastAt=at;lastLat=lat;lastLng=lng;lastAccuracy=accuracy;
        if(jobId.isEmpty()||job.optBoolean("done",false)||job.optLong("expiresAt",0)<now){detector=null;detectorJob="";return;}
        double targetLat=job.optDouble("lat",Double.NaN),targetLng=job.optDouble("lng",Double.NaN);
        if(!Double.isFinite(targetLat)||!Double.isFinite(targetLng))return;
        if(!jobId.equals(detectorJob)){detector=new StopDetector(new StopDetector.Target(jobId,targetLat,targetLng,job.optBoolean("precise",false)));detectorJob=jobId;}
        StopDetector.Stop stop=detector.accept(at,lat,lng,accuracy,speed);
        if(!detector.status.equals(detectorStatus)){detectorStatus=detector.status;store.diagnostic(detectorStatus,null);}
        if(stop!=null)try{
            JSONObject event=new JSONObject();event.put("kind","collection-stop");event.put("shiftId",shift);event.put("arrived",stop.arrival);event.put("departed",stop.departure);event.put("lat",stop.lat);event.put("lng",stop.lng);event.put("accuracy",stop.accuracy);event.put("minutes",stop.minutes);event.put("samples",stop.samples);event.put("eligible",stop.eligible);event.put("source","native-gps");
            store.event(jobId,event);job.put("done",true);job.remove("lat");job.remove("lng");store.put("job",job.toString());
            store.diagnostic("collection_stop_saved",new JSONObject().put("minutes",stop.minutes).put("eligible",stop.eligible).put("samples",stop.samples).put("accuracy",stop.accuracy));
        }catch(Exception ignored){store.put("reason","Could not save a collection estimate; raw readings remain available.");}
    }
    private void logFixes(long now){if(now-logAt<60000)return;try{store.diagnostic("gps_quality_summary",new JSONObject().put("accepted",acceptedFixes).put("rejected",rejectedFixes).put("bestAccuracy",bestAccuracy));}catch(Exception ignored){}logAt=now;acceptedFixes=0;rejectedFixes=0;bestAccuracy=50;}
    @Override public void onProviderDisabled(String provider){store.diagnostic("gps_provider_disabled",null);store.put("reason","Location provider disabled; tracking has a gap until location resumes.");}
    @Override public void onProviderEnabled(String provider){store.diagnostic("gps_provider_enabled",null);store.put("reason","");}
    @Override public void onDestroy(){running=false;store.diagnostic("gps_service_stop",null);if(manager!=null)manager.removeUpdates(this);if(thread!=null)thread.quitSafely();stopForeground(STOP_FOREGROUND_REMOVE);super.onDestroy();}
    @Override public IBinder onBind(Intent intent){return null;}
}
