package com.hutchy9999.shiftprofit;

import android.Manifest;
import android.app.Activity;
import android.content.*;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import androidx.activity.result.ActivityResult;
import androidx.core.content.ContextCompat;
import com.getcapacitor.*;
import com.getcapacitor.annotation.*;
import org.json.*;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name="ShiftTracker",permissions={
    @Permission(alias="location",strings={Manifest.permission.ACCESS_COARSE_LOCATION,Manifest.permission.ACCESS_FINE_LOCATION}),
    @Permission(alias="notifications",strings={Manifest.permission.POST_NOTIFICATIONS})
})
public final class ShiftTrackerPlugin extends Plugin {
    private TrackingStore store(){return TrackingStore.get(getContext());}
    @PluginMethod public void state(PluginCall call){try{JSONObject value=store().summary();value.put("running",ShiftLocationService.running);value.put("precisePermission",getPermissionState("location")==PermissionState.GRANTED);call.resolve(JSObject.fromJSONObject(value));}catch(Exception e){call.reject("Could not read native tracking state");}}
    @PluginMethod public void start(PluginCall call){
        String shift=call.getString("shiftId","");if(shift.isEmpty()||shift.length()>200){call.reject("A valid current shift is required");return;}
        if(getPermissionState("location")!=PermissionState.GRANTED||(Build.VERSION.SDK_INT>=33&&getPermissionState("notifications")!=PermissionState.GRANTED)){
            requestPermissionForAliases(Build.VERSION.SDK_INT>=33?new String[]{"location","notifications"}:new String[]{"location"},call,"trackingPermissions");return;
        }
        startReady(call);
    }
    @PermissionCallback private void trackingPermissions(PluginCall call){
        if(getPermissionState("location")!=PermissionState.GRANTED){call.reject("Allow precise location to record this shift. You can still use the app without tracking.");return;}
        if(Build.VERSION.SDK_INT>=33&&getPermissionState("notifications")!=PermissionState.GRANTED){call.reject("Allow notifications so the ongoing GPS status and pause control stay visible.");return;}
        startReady(call);
    }
    private void startReady(PluginCall call){
        if(!getActivity().getLifecycle().getCurrentState().isAtLeast(androidx.lifecycle.Lifecycle.State.STARTED)){call.reject("Open the app to start or resume tracking");return;}
        String shift=call.getString("shiftId","");
        try{
            if(!shift.equals(store().text("shift",""))){store().put("gaps","0");store().put("lastFix","0");store().put("job","{}");}
            store().put("shift",shift);store().put("paused","false");
            ContextCompat.startForegroundService(getContext(),new Intent(getContext(),ShiftLocationService.class));call.resolve();
        }catch(Exception e){call.reject("Could not start GPS. Open app permissions and check precise location.");}
    }
    @PluginMethod public void stop(PluginCall call){ShiftLocationService.running=false;getContext().stopService(new Intent(getContext(),ShiftLocationService.class));store().put("shift","");store().put("job","{}");store().put("paused","false");call.resolve();}
    @PluginMethod public void pause(PluginCall call){store().put("paused","true");ShiftLocationService.running=false;getContext().stopService(new Intent(getContext(),ShiftLocationService.class));call.resolve();}
    @PluginMethod public void setJob(PluginCall call){
        try{
            JSONObject job=call.getObject("job",new JSObject());String id=job.optString("id","");
            if(id.length()>200)throw new IllegalArgumentException();
            JSONObject current=store().object("job");
            if(id.equals(current.optString("id",""))&&current.optBoolean("done",false)){call.resolve();return;}
            if(!id.isEmpty()){
                if(!job.optString("shiftId","").equals(store().text("shift","")))throw new IllegalArgumentException();
                double lat=job.optDouble("lat",Double.NaN),lng=job.optDouble("lng",Double.NaN);
                if(job.has("lat")&&(!Double.isFinite(lat)||!Double.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180))throw new IllegalArgumentException();
                job.put("expiresAt",Math.min(job.optLong("expiresAt",0),System.currentTimeMillis()+21600000));
            }
            store().put("job",job.toString());call.resolve();
        }catch(Exception e){call.reject("Could not attach the pickup target to this shift");}
    }
    @PluginMethod public void events(PluginCall call){try{JSObject out=new JSObject();out.put("events",store().events());call.resolve(out);}catch(Exception e){call.reject("Could not read collection events");}}
    @PluginMethod public void acknowledge(PluginCall call){store().acknowledge(call.getArray("ids",new JSArray()));call.resolve();}
    @PluginMethod public void restoreTracking(PluginCall call){
        try{ShiftLocationService.running=false;getContext().stopService(new Intent(getContext(),ShiftLocationService.class));store().restore(call.getObject("data",new JSObject()));call.resolve();}catch(Exception e){call.reject("Native tracking backup was invalid. Native history was not replaced.");}
    }
    @PluginMethod public void clearDiagnostics(PluginCall call){try{store().clearDiagnostics();call.resolve();}catch(Exception e){call.reject("Could not clear diagnostics");}}
    @PluginMethod public void exportFile(PluginCall call){
        String type=call.getString("type","application/json"),name=call.getString("filename","shift-profit-backup.json");
        if(!type.equals("application/json")&&!type.equals("text/csv")){call.reject("Unsupported backup type");return;}
        name=name.replaceAll("[^A-Za-z0-9._-]","_");if(name.length()>120)name=name.substring(name.length()-120);
        Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT);intent.addCategory(Intent.CATEGORY_OPENABLE);intent.setType(type);intent.putExtra(Intent.EXTRA_TITLE,name);
        startActivityForResult(call,intent,"fileCreated");
    }
    @ActivityCallback private void fileCreated(PluginCall call,ActivityResult result){
        if(call==null)return;
        if(result.getResultCode()!=Activity.RESULT_OK||result.getData()==null||result.getData().getData()==null){JSObject out=new JSObject();out.put("saved",false);call.resolve(out);return;}
        Uri uri=result.getData().getData();
        getBridge().execute(()->{
            try{
                String text=call.getString("text","");
                if(call.getBoolean("includeTracking",false)){JSONObject backup=new JSONObject(text);backup.put("nativeTracking",store().exportData());text=backup.toString(2);}
                if(call.getBoolean("includeDiagnostics",false)){JSONObject log=new JSONObject(text);log.put("nativeEvents",store().diagnostics());log.put("androidApi",Build.VERSION.SDK_INT);log.put("appVersion","0.1.0-trial");text=log.toString(2);}
                try(OutputStream output=getContext().getContentResolver().openOutputStream(uri,"wt")){if(output==null)throw new IllegalStateException();output.write(text.getBytes(StandardCharsets.UTF_8));}
                JSObject out=new JSObject();out.put("saved",true);call.resolve(out);
            }catch(Exception e){call.reject("Could not save the backup. Choose a writable destination and retry.");}
        });
    }
    @PluginMethod public void openAppSettings(PluginCall call){getActivity().startActivity(new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:"+getContext().getPackageName())));call.resolve();}
}
