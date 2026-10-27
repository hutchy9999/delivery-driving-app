package com.hutchy9999.shiftprofit;

import android.content.ContentValues;
import android.content.Context;
import android.database.Cursor;
import android.database.sqlite.SQLiteDatabase;
import android.database.sqlite.SQLiteOpenHelper;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.UUID;

/** App-private durable readings/events, independent of WebView suspension. */
public final class TrackingStore extends SQLiteOpenHelper {
    private static TrackingStore instance;
    public static synchronized TrackingStore get(Context context){if(instance==null)instance=new TrackingStore(context.getApplicationContext());return instance;}
    private TrackingStore(Context context){super(context,"shift-tracking.db",null,2);setWriteAheadLoggingEnabled(true);}
    @Override public void onCreate(SQLiteDatabase db){
        db.execSQL("CREATE TABLE meta (name TEXT PRIMARY KEY, value TEXT NOT NULL)");
        db.execSQL("CREATE TABLE points (id INTEGER PRIMARY KEY AUTOINCREMENT, shift_id TEXT, job_id TEXT, at INTEGER, lat REAL, lng REAL, accuracy REAL, speed REAL, metres REAL)");
        db.execSQL("CREATE INDEX points_shift ON points(shift_id,at)");
        db.execSQL("CREATE TABLE events (id TEXT PRIMARY KEY, job_id TEXT, payload TEXT NOT NULL, acknowledged INTEGER NOT NULL DEFAULT 0)");
        createDiagnostics(db);
    }
    private void createDiagnostics(SQLiteDatabase db){db.execSQL("CREATE TABLE IF NOT EXISTS diagnostics (id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER, code TEXT, payload TEXT)");}
    @Override public void onUpgrade(SQLiteDatabase db,int oldVersion,int newVersion){if(oldVersion<2)createDiagnostics(db);}
    /** Call sites supply fixed event codes and numeric/boolean metadata only. Never route coordinates. */
    public synchronized void diagnostic(String code,JSONObject detail){try{long now=System.currentTimeMillis();ContentValues v=new ContentValues();v.put("at",now);v.put("code",code);v.put("payload",detail==null?"{}":detail.toString());SQLiteDatabase db=getWritableDatabase();db.insert("diagnostics",null,v);db.execSQL("DELETE FROM diagnostics WHERE at<? OR id NOT IN (SELECT id FROM diagnostics ORDER BY id DESC LIMIT 5000)",new Object[]{now-604800000});}catch(Exception ignored){}}
    public synchronized JSONArray diagnostics()throws Exception{JSONArray out=new JSONArray();try(Cursor c=getReadableDatabase().rawQuery("SELECT at,code,payload FROM diagnostics WHERE at>? ORDER BY id",new String[]{Long.toString(System.currentTimeMillis()-604800000)})){while(c.moveToNext()){JSONObject row=new JSONObject(c.getString(2));row.put("at",c.getLong(0));row.put("code",c.getString(1));out.put(row);}}return out;}
    public synchronized void clearDiagnostics(){getWritableDatabase().delete("diagnostics",null,null);}
    public synchronized String text(String key,String fallback){try(Cursor c=getReadableDatabase().rawQuery("SELECT value FROM meta WHERE name=?",new String[]{key})){return c.moveToFirst()?c.getString(0):fallback;}}
    public synchronized JSONObject object(String key){try{return new JSONObject(text(key,"{}"));}catch(Exception e){return new JSONObject();}}
    public synchronized void put(String key,String value){ContentValues v=new ContentValues();v.put("name",key);v.put("value",value);getWritableDatabase().insertWithOnConflict("meta",null,v,SQLiteDatabase.CONFLICT_REPLACE);}
    public synchronized void point(String shift,String job,long at,double lat,double lng,double accuracy,double speed,double metres){
        ContentValues v=new ContentValues();v.put("shift_id",shift);v.put("job_id",job);v.put("at",at);v.put("lat",lat);v.put("lng",lng);v.put("accuracy",accuracy);v.put("speed",speed);v.put("metres",metres);getWritableDatabase().insertOrThrow("points",null,v);
    }
    public synchronized void event(String job,JSONObject payload)throws Exception{
        String id=UUID.randomUUID().toString();payload.put("id",id);payload.put("jobId",job);
        ContentValues v=new ContentValues();v.put("id",id);v.put("job_id",job);v.put("payload",payload.toString());getWritableDatabase().insertOrThrow("events",null,v);
    }
    public synchronized JSONArray events()throws Exception{
        JSONArray out=new JSONArray();try(Cursor c=getReadableDatabase().rawQuery("SELECT payload FROM events WHERE acknowledged=0 ORDER BY rowid LIMIT 100",null)){while(c.moveToNext())out.put(new JSONObject(c.getString(0)));}return out;
    }
    public synchronized void acknowledge(JSONArray ids){for(int i=0;i<ids.length();i++){ContentValues v=new ContentValues();v.put("acknowledged",1);getWritableDatabase().update("events",v,"id=?",new String[]{ids.optString(i)});}}
    public synchronized JSONObject summary()throws Exception{
        String shift=text("shift","");JSONObject out=new JSONObject();out.put("shiftId",shift);out.put("paused",text("paused","false").equals("true"));out.put("reason",text("reason",""));out.put("lastFix",Long.parseLong(text("lastFix","0")));
        try(Cursor c=getReadableDatabase().rawQuery("SELECT COUNT(*),COALESCE(SUM(metres),0) FROM points WHERE shift_id=?",new String[]{shift})){c.moveToFirst();out.put("samples",c.getLong(0));out.put("miles",c.getDouble(1)/1609.344);}
        out.put("gaps",Integer.parseInt(text("gaps","0")));return out;
    }
    public synchronized JSONObject exportData()throws Exception{
        JSONObject out=new JSONObject();out.put("version",1);JSONArray points=new JSONArray(),events=new JSONArray();
        try(Cursor c=getReadableDatabase().rawQuery("SELECT shift_id,job_id,at,lat,lng,accuracy,speed,metres FROM points ORDER BY id",null)){
            while(c.moveToNext()){JSONObject p=new JSONObject();p.put("shiftId",c.getString(0));p.put("jobId",c.getString(1));p.put("at",c.getLong(2));p.put("lat",c.getDouble(3));p.put("lng",c.getDouble(4));p.put("accuracy",c.getDouble(5));p.put("speed",c.getDouble(6));p.put("metres",c.getDouble(7));points.put(p);}
        }
        try(Cursor c=getReadableDatabase().rawQuery("SELECT payload,acknowledged FROM events ORDER BY rowid",null)){while(c.moveToNext()){JSONObject e=new JSONObject(c.getString(0));e.put("acknowledged",c.getInt(1)==1);events.put(e);}}
        out.put("points",points);out.put("events",events);return out;
    }
    public synchronized void restore(JSONObject input)throws Exception{
        JSONArray points=input.optJSONArray("points"),events=input.optJSONArray("events");
        if(points==null)points=new JSONArray();if(events==null)events=new JSONArray();
        if((input.has("version")&&input.optInt("version",0)!=1)||points.length()>500000||events.length()>50000)throw new IllegalArgumentException("Tracking backup is unsupported or too large");
        // Validate every record before replacing native history.
        for(int i=0;i<points.length();i++){JSONObject p=points.getJSONObject(i);double lat=p.getDouble("lat"),lng=p.getDouble("lng"),acc=p.getDouble("accuracy"),m=p.getDouble("metres"),speed=p.optDouble("speed",0);if(!Double.isFinite(lat)||!Double.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180||!Double.isFinite(acc)||acc<0||!Double.isFinite(m)||m<0||!Double.isFinite(speed)||speed<0)throw new IllegalArgumentException("Invalid tracking point");if(p.getLong("at")<=0)throw new IllegalArgumentException("Invalid tracking time");p.getString("shiftId");}
        for(int i=0;i<events.length();i++){JSONObject e=events.getJSONObject(i);e.getString("id");e.getString("jobId");}
        SQLiteDatabase db=getWritableDatabase();db.beginTransaction();
        try{
            db.delete("points",null,null);db.delete("events",null,null);db.delete("meta",null,null);
            for(int i=0;i<points.length();i++){JSONObject p=points.getJSONObject(i);point(p.getString("shiftId"),p.optString("jobId",""),p.getLong("at"),p.getDouble("lat"),p.getDouble("lng"),p.getDouble("accuracy"),p.optDouble("speed",0),p.getDouble("metres"));}
            for(int i=0;i<events.length();i++){JSONObject e=events.getJSONObject(i);ContentValues v=new ContentValues();v.put("id",e.getString("id"));v.put("job_id",e.getString("jobId"));v.put("payload",e.toString());v.put("acknowledged",e.optBoolean("acknowledged",true)?1:0);db.insertWithOnConflict("events",null,v,SQLiteDatabase.CONFLICT_REPLACE);}
            db.setTransactionSuccessful();
        }finally{db.endTransaction();}
    }
}
